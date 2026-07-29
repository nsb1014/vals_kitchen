#!/usr/bin/env python3
"""Build the project-CC0 chibi restaurant surfaces, furniture, and chef frames.

The source sheets are intentionally retained in vendor/generated/chibi-ui/source so
the shipped atlases remain reproducible. This script only crops, keys, and scales
those sources; it never invents replacement pixels from legacy sprites.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "vendor" / "generated" / "chibi-ui" / "source"
OUT = ROOT / "vendor" / "generated" / "chibi-ui"
PLAYER_OUT = OUT / "player-frames"
TILE_OUT = OUT / "restaurant-tiles"
PROP_OUT = OUT / "restaurant-props"


def chroma_alpha(image: Image.Image) -> Image.Image:
    """Remove the flat #ff00ff source matte with a soft antialias ramp."""
    rgba = image.convert("RGBA")
    pixels = []
    for red, green, blue, source_alpha in rgba.get_flattened_data():
        distance = ((255 - red) ** 2 + green**2 + (255 - blue) ** 2) ** 0.5
        matte = max(0, min(255, round((distance - 7) * 255 / 55)))
        alpha = min(source_alpha, matte)
        if alpha < 255:
            # Suppress key-color fringe only in pixels influenced by the matte.
            red = min(red, max(green, blue))
            blue = min(blue, max(red, green))
        pixels.append((red, green, blue, alpha))
    rgba.putdata(pixels)
    return rgba


def white_alpha(image: Image.Image) -> Image.Image:
    """Remove the chef sheet's neutral white background without erasing skin."""
    rgba = image.convert("RGBA")
    pixels = []
    for red, green, blue, source_alpha in rgba.get_flattened_data():
        spread = max(red, green, blue) - min(red, green, blue)
        if min(red, green, blue) >= 224 and spread <= 14:
            matte = max(0, min(255, (255 - min(red, green, blue) - 2) * 18))
            alpha = min(source_alpha, matte)
        else:
            alpha = source_alpha
        pixels.append((red, green, blue, alpha))
    rgba.putdata(pixels)
    return rgba


def trim(image: Image.Image, padding: int = 0) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Sprite crop contains no visible pixels")
    left, top, right, bottom = bbox
    return image.crop(
        (
            max(0, left - padding),
            max(0, top - padding),
            min(image.width, right + padding),
            min(image.height, bottom + padding),
        )
    )


def contain(image: Image.Image, size: tuple[int, int], bottom_pad: int = 2) -> Image.Image:
    target_w, target_h = size
    available_h = target_h - bottom_pad * 2
    scale = min((target_w - 4) / image.width, available_h / image.height)
    resized = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (target_w - resized.width) // 2
    y = target_h - bottom_pad - resized.height
    canvas.alpha_composite(resized, (x, y))
    return canvas


def clear_alpha_noise(image: Image.Image, cutoff: int = 20) -> Image.Image:
    """Drop near-invisible matte noise while retaining the character edge ramp."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: 0 if value < cutoff else value)
    rgba.putalpha(alpha)
    return rgba


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def build_player() -> None:
    sheet = Image.open(SOURCE / "chef-sheet.png").convert("RGBA")
    if sheet.size != (1536, 1024):
        raise SystemExit(f"Unexpected chef sheet size: {sheet.size}")
    facings = ("down", "left", "right", "up")
    for row, facing in enumerate(facings):
        for frame in range(3):
            x0 = round(frame * sheet.width / 5)
            x1 = round((frame + 1) * sheet.width / 5)
            y0 = row * sheet.height // 4
            y1 = (row + 1) * sheet.height // 4
            sprite = clear_alpha_noise(
                contain(trim(white_alpha(sheet.crop((x0, y0, x1, y1))), 3), (80, 96))
            )
            save(sprite, PLAYER_OUT / f"player_{facing}_{frame}.png")

        carry_x0 = round(4 * sheet.width / 5)
        carry = sheet.crop(
            (
                carry_x0,
                row * sheet.height // 4,
                sheet.width,
                (row + 1) * sheet.height // 4,
            )
        )
        save(
            clear_alpha_noise(contain(trim(white_alpha(carry), 3), (80, 96))),
            PLAYER_OUT / f"player_carry_{facing}.png",
        )

    # Stable compatibility keys used while atlases are loading.
    save(Image.open(PLAYER_OUT / "player_down_0.png"), PLAYER_OUT / "player.png")
    save(Image.open(PLAYER_OUT / "player_down_1.png"), PLAYER_OUT / "player_walk.png")


def seamless_surface(image: Image.Image) -> Image.Image:
    """Build a seamless 64px material tile from generated high-resolution art."""
    side = min(image.width, image.height)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    source = image.crop((left + 14, top + 14, left + side - 14, top + side - 14))
    source = source.convert("RGB").resize((32, 32), Image.Resampling.LANCZOS)
    tile = Image.new("RGB", (64, 64))
    tile.paste(source, (0, 0))
    tile.paste(source.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (32, 0))
    tile.paste(source.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, 32))
    tile.paste(
        source.transpose(Image.Transpose.FLIP_LEFT_RIGHT).transpose(
            Image.Transpose.FLIP_TOP_BOTTOM
        ),
        (32, 32),
    )
    return tile.convert("RGBA")


def build_surfaces() -> None:
    sheet = Image.open(SOURCE / "surfaces-sheet-keyed.png").convert("RGBA")
    if sheet.size != (1536, 1024):
        raise SystemExit(f"Unexpected surfaces sheet size: {sheet.size}")

    floor_boxes = {
        "floor_wood_a": (22, 206, 299, 483),
        "floor_wood_b": (335, 206, 593, 483),
        "floor_kitchen_a": (627, 206, 889, 483),
        "floor_kitchen_b": (925, 206, 1189, 483),
    }
    for name, box in floor_boxes.items():
        save(seamless_surface(sheet.crop(box)), TILE_OUT / f"{name}.png")

    wall_boxes = {
        "wall": (1223, 203, 1504, 486),
        "wall_n": (1223, 203, 1504, 486),
        "wall_e": (43, 526, 264, 812),
        "wall_w": (359, 528, 566, 812),
        "wall_s": (616, 527, 887, 812),
        "door": (915, 527, 1190, 812),
        "door_open": (1223, 526, 1505, 812),
    }
    for name, box in wall_boxes.items():
        sprite = contain(trim(sheet.crop(box), 2), (64, 64), 0)
        save(sprite, TILE_OUT / f"{name}.png")


def build_props() -> None:
    sheet = Image.open(SOURCE / "furniture-sheet-keyed.png").convert("RGBA")
    if sheet.size != (1536, 1024):
        raise SystemExit(f"Unexpected furniture sheet size: {sheet.size}")

    boxes = {
        "table_2seat": (140, 76, 303, 291),
        "table_2seat_unset": (430, 76, 594, 291),
        "table_2seat_dirty": (720, 73, 881, 291),
        "chair": (1004, 83, 1097, 294),
        "chair_back": (1175, 83, 1287, 294),
        "chair_side": (1342, 96, 1454, 289),
        "prep_station": (86, 350, 314, 638),
        "oven": (401, 351, 583, 638),
        "grill": (677, 351, 866, 638),
        "fryer": (957, 350, 1108, 638),
        "cold_station": (1188, 345, 1451, 638),
        "barista_station": (88, 700, 311, 951),
        "pastry_bench": (384, 700, 627, 952),
        "stockpot": (698, 687, 889, 953),
        "wok": (963, 701, 1158, 953),
        "fermentation_crock": (1243, 700, 1447, 953),
    }
    for name, box in boxes.items():
        sprite = contain(trim(sheet.crop(box), 2), (64, 96))
        save(sprite, PROP_OUT / f"{name}.png")


def main() -> None:
    for required in (
        "chef-sheet.png",
        "surfaces-sheet-keyed.png",
        "furniture-sheet-keyed.png",
    ):
        if not (SOURCE / required).is_file():
            raise SystemExit(f"Missing chibi source sheet: {SOURCE / required}")
    build_player()
    build_surfaces()
    build_props()
    print("Built chibi UI assets:")
    print(f"  player frames: {len(list(PLAYER_OUT.glob('*.png')))}")
    print(f"  surfaces: {len(list(TILE_OUT.glob('*.png')))}")
    print(f"  furniture: {len(list(PROP_OUT.glob('*.png')))}")


if __name__ == "__main__":
    main()
