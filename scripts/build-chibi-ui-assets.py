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
    """Remove the chef sheet's neutral white background without erasing skin.

    The source matte is a slightly noisy off-white (usually 252--254), not
    literal #fff.  The old conversion left those 252-valued pixels with alpha
    18.  ``trim`` therefore treated the entire source cell as artwork and
    scaled the chef down together with a box of almost-transparent noise.
    Keep a fully transparent dead band for the matte, then feather only the
    darker neutral pixels at the character edge.
    """
    rgba = image.convert("RGBA")
    pixels = []
    for red, green, blue, source_alpha in rgba.get_flattened_data():
        spread = max(red, green, blue) - min(red, green, blue)
        darkest = min(red, green, blue)
        if darkest >= 215 and spread <= 20:
            matte = max(0, min(255, round((245 - darkest) * 255 / 30)))
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


def resize_exact(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Fill an architectural tile edge-to-edge; seams are worse than mild distortion."""
    return image.resize(size, Image.Resampling.LANCZOS)


def clear_alpha_noise(image: Image.Image, cutoff: int = 20) -> Image.Image:
    """Drop near-invisible matte noise while retaining the character edge ramp."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: 0 if value < cutoff else value)
    rgba.putalpha(alpha)
    return rgba


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def validate_player_frame(image: Image.Image, name: str) -> None:
    """Fail the asset build if matte noise or a bad crop shrinks an actor again."""
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError(f"Player frame is empty: {name}")
    visible_height = bounds[3] - bounds[1]
    bottom_gap = image.height - bounds[3]
    if visible_height < 84 or not 1 <= bottom_gap <= 4:
        raise ValueError(
            f"Player frame is not feet-normalized: {name} "
            f"(bounds={bounds}, visible_height={visible_height}, bottom_gap={bottom_gap})"
        )


def validate_animation_frames() -> None:
    """Reject clipped silhouettes and unstable walk-cycle crops before packing."""
    for variant in ("a", "b", "c", "d", "e"):
        for facing in ("down", "left", "right", "up"):
            heights = []
            for frame in range(3):
                name = f"guest_{variant}_{facing}_{frame}.png"
                image = Image.open(OUT / "guest-frames" / name).convert("RGBA")
                bounds = image.getchannel("A").getbbox()
                if bounds is None:
                    raise ValueError(f"Guest animation frame is empty: {name}")
                margins = (
                    bounds[0],
                    bounds[1],
                    image.width - bounds[2],
                    image.height - bounds[3],
                )
                if min(margins) < 6:
                    raise ValueError(f"Guest animation frame is clipped: {name} margins={margins}")
                heights.append(bounds[3] - bounds[1])
            if max(heights) - min(heights) > 3:
                raise ValueError(
                    f"Guest walk cycle changes crop height: {variant} {facing} {heights}"
                )


def build_player() -> None:
    sheet = Image.open(SOURCE / "chef-sheet.png").convert("RGBA")
    if sheet.size != (1536, 1024):
        raise SystemExit(f"Unexpected chef sheet size: {sheet.size}")

    # The figures are arranged as a 5x4 sheet, but they are not centered in
    # equal-height cells: the next row starts before an exact 256px boundary.
    # Cropping on those mathematical boundaries clipped hair from one facing
    # into another.  These cuts sit in the actual gutters in the supplied art.
    column_bounds = ((0, 348), (348, 622), (622, 909), (909, 1192), (1192, 1536))
    facing_rows = {
        "down": (0, 245),
        "left": (245, 486),
        "right": (486, 723),
        "up": (723, 1024),
    }

    def player_frame(column: int, facing: str) -> Image.Image:
        x0, x1 = column_bounds[column]
        y0, y1 = facing_rows[facing]
        keyed = white_alpha(sheet.crop((x0, y0, x1, y1)))
        return clear_alpha_noise(contain(trim(keyed, 3), (80, 96)))

    for facing in facing_rows:
        for frame in range(3):
            name = f"player_{facing}_{frame}"
            sprite = player_frame(frame, facing)
            validate_player_frame(sprite, name)
            save(sprite, PLAYER_OUT / f"{name}.png")

        carry_name = f"player_carry_{facing}"
        carry_sprite = player_frame(4, facing)
        validate_player_frame(carry_sprite, carry_name)
        save(carry_sprite, PLAYER_OUT / f"{carry_name}.png")

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
        # Crop away the neighboring wall panels so the actual doorway fills
        # its grid opening instead of reading as a miniature door in a wall.
        "door": (950, 527, 1155, 812),
        "door_open": (1255, 526, 1475, 812),
    }
    for name, box in wall_boxes.items():
        sprite = resize_exact(trim(sheet.crop(box)), (64, 64))
        bounds = sprite.getchannel("A").getbbox()
        if bounds != (0, 0, 64, 64):
            raise ValueError(f"Architectural tile must fill its cell: {name} bounds={bounds}")
        save(sprite, TILE_OUT / f"{name}.png")


def build_props() -> None:
    sheet = Image.open(SOURCE / "furniture-sheet-keyed.png").convert("RGBA")
    table_sheet = Image.open(SOURCE / "furniture-sheet-v2-keyed.png").convert("RGBA")
    if sheet.size != (1536, 1024):
        raise SystemExit(f"Unexpected furniture sheet size: {sheet.size}")
    if table_sheet.size != (1536, 1024):
        raise SystemExit(f"Unexpected corrected table sheet size: {table_sheet.size}")

    # The corrected source contains clean table surfaces without an embedded
    # third chair. Keep the original source for every other prop so the edit is
    # tightly scoped and cannot drift the station art.
    table_boxes = {
        "table_2seat": (138, 75, 305, 266),
        "table_2seat_unset": (410, 75, 580, 266),
        "table_2seat_dirty": (677, 74, 868, 266),
    }
    for name, box in table_boxes.items():
        sprite = contain(trim(table_sheet.crop(box), 2), (64, 96))
        save(sprite, PROP_OUT / f"{name}.png")

    boxes = {
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
        "furniture-sheet-v2-keyed.png",
    ):
        if not (SOURCE / required).is_file():
            raise SystemExit(f"Missing chibi source sheet: {SOURCE / required}")
    build_player()
    validate_animation_frames()
    build_surfaces()
    build_props()
    print("Built chibi UI assets:")
    print(f"  player frames: {len(list(PLAYER_OUT.glob('*.png')))}")
    print(f"  surfaces: {len(list(TILE_OUT.glob('*.png')))}")
    print(f"  furniture: {len(list(PROP_OUT.glob('*.png')))}")


if __name__ == "__main__":
    main()
