#!/usr/bin/env python3
"""Build the project-CC0 chibi restaurant surfaces, furniture, and chef frames.

The source sheets are intentionally retained in vendor/generated/chibi-ui/source so
the shipped atlases remain reproducible. This script crops, keys, and scales those
sources, and also generates project-CC0 side-wall tiles plus clipped-crown repairs
for retained guest frames.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "vendor" / "generated" / "chibi-ui" / "source"
OUT = ROOT / "vendor" / "generated" / "chibi-ui"
PLAYER_OUT = OUT / "player-frames"
GUEST_OUT = OUT / "guest-frames"
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


def harden_sprite_alpha(image: Image.Image, solid_cutoff: int = 40) -> Image.Image:
    """Force body pixels fully opaque so characters never render see-through.

    LANCZOS downscales leave a soft mid-alpha haze across dresses/skin that reads
    as ghosting on busy floors. Below solid_cutoff, snap to fully transparent so
    remaining edge ramp cannot smear into the silhouette under nearest filtering.
    """
    rgba = image.convert("RGBA")
    px = rgba.load()
    assert px is not None
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = px[x, y]
            if alpha >= solid_cutoff:
                px[x, y] = (red, green, blue, 255)
            else:
                # Zero RGB on cutouts so premultiply/fringe cannot revive ghosts.
                px[x, y] = (0, 0, 0, 0)
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


def top_row_fill_ratio(image: Image.Image) -> float:
    """Opaque fill of the silhouette's top row versus a few pixels lower."""
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        return 0.0
    x0, y0, x1, y1 = bounds
    top = sum(1 for x in range(x0, x1) if image.getpixel((x, y0))[3] > 32)
    probe_y = min(y1 - 1, y0 + 8)
    mid = sum(1 for x in range(x0, x1) if image.getpixel((x, probe_y))[3] > 32)
    return top / max(1, mid)


def validate_animation_frames() -> None:
    """Reject clipped silhouettes and unstable walk-cycle crops before packing."""
    for variant in ("a", "b", "c", "d", "e"):
        for facing in ("down", "left", "right", "up"):
            heights = []
            for frame in range(3):
                name = f"guest_{variant}_{facing}_{frame}.png"
                image = Image.open(GUEST_OUT / name).convert("RGBA")
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
                if facing == "up" and top_row_fill_ratio(image) > 0.55:
                    raise ValueError(
                        f"Guest up-facing frame still has a flat clipped crown: {name} "
                        f"fill={top_row_fill_ratio(image):.2f}"
                    )
                heights.append(bounds[3] - bounds[1])
            if max(heights) - min(heights) > 3:
                raise ValueError(
                    f"Guest walk cycle changes crop height: {variant} {facing} {heights}"
                )
        sit_up = GUEST_OUT / f"guest_{variant}_sit_up.png"
        if sit_up.is_file():
            image = Image.open(sit_up).convert("RGBA")
            if top_row_fill_ratio(image) > 0.55:
                raise ValueError(
                    f"Guest sit-up frame still has a flat clipped crown: {sit_up.name} "
                    f"fill={top_row_fill_ratio(image):.2f}"
                )


def sample_hair_color(image: Image.Image, bounds: tuple[int, int, int, int]) -> tuple[int, int, int]:
    x0, y0, x1, y1 = bounds
    cx = (x0 + x1) // 2
    samples: list[tuple[int, int, int]] = []
    for y in range(y0, min(y1, y0 + 12)):
        for x in range(max(x0, cx - 18), min(x1, cx + 18)):
            red, green, blue, alpha = image.getpixel((x, y))
            if alpha < 200:
                continue
            # Skip near-skin tones; keep hair / bun colors.
            if red > 170 and green > 120 and blue > 90 and abs(red - green) < 45:
                continue
            samples.append((red, green, blue))
    if not samples:
        return (120, 110, 100)
    samples.sort(key=lambda rgb: rgb[0] + rgb[1] + rgb[2])
    return samples[len(samples) // 2]


def repair_clipped_crown(image: Image.Image) -> Image.Image:
    """Rebuild a rounded crown when an up-facing frame was hard-clipped flat.

    Take the existing hair just below the clip, shrink it into a short elliptical
    cap, and paste it on the flat top so the bun finishes with real texture.
    """
    rgba = image.convert("RGBA")
    if top_row_fill_ratio(rgba) <= 0.55:
        return rgba
    bounds = rgba.getchannel("A").getbbox()
    if bounds is None:
        return rgba
    x0, y0, x1, y1 = bounds
    width = x1 - x0
    tip_y = 6
    bottom_margin = rgba.height - y1
    # Need a little headroom above the clip for the cap.
    needed = 12
    shift = min(max(0, needed - (y0 - tip_y)), max(0, bottom_margin - 6))
    if shift > 0:
        shifted = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
        shifted.alpha_composite(rgba, (0, shift))
        rgba = shifted
        x0, y0, x1, y1 = rgba.getchannel("A").getbbox()

    canvas = rgba.copy()
    sample_h = min(28, max(12, (y1 - y0) // 5))
    hair = canvas.crop((x0, y0, x1, min(y1, y0 + sample_h))).convert("RGBA")
    cap_h = min(14, max(10, y0 - tip_y))
    cap_w = max(8, int(width * 0.92))
    cap = hair.resize((cap_w, cap_h), Image.Resampling.LANCZOS)

    # Elliptical mask so the cap reads as a rounded crown, not a brick.
    mask = Image.new("L", (cap_w, cap_h), 0)
    mask_px = mask.load()
    assert mask_px is not None
    cx_local = (cap_w - 1) / 2
    cy_local = cap_h - 1  # sit on the hairline; tip at top
    rx = cap_w / 2
    ry = cap_h * 0.95
    for y in range(cap_h):
        for x in range(cap_w):
            nx = (x - cx_local) / max(rx, 1)
            # Use the lower half of an ellipse so the top is rounded.
            ny = (y - cy_local) / max(ry, 1)
            if nx * nx + ny * ny <= 1.0:
                # Soften the tip.
                mask_px[x, y] = 255 if y > 0 or abs(nx) < 0.25 else 0

    paste_x = int(round(((x0 + x1) / 2) - cap_w / 2))
    # Overlap the hairline generously so the cap does not float above the bun.
    paste_y = y0 - cap_h + 5
    if paste_y < tip_y:
        paste_y = tip_y
    canvas.paste(cap, (paste_x, paste_y), mask)
    return canvas


def repair_guest_crowns() -> int:
    """Repair retained guest up/sit-up frames that lost their crown to a hard crop."""
    repaired = 0
    for path in sorted(GUEST_OUT.glob("*.png")):
        name = path.name
        if "_up_" not in name and not name.endswith("_sit_up.png"):
            continue
        if name.endswith("_sit_down.png") or "_down_" in name:
            continue
        original = Image.open(path).convert("RGBA")
        fixed = repair_clipped_crown(original)
        if fixed.tobytes() != original.tobytes():
            save(fixed, path)
            repaired += 1
    return repaired


def harden_guest_frames() -> int:
    """Force guest body pixels opaque so diners never read as ghosts on the floor."""
    hardened = 0
    for path in sorted(GUEST_OUT.glob("*.png")):
        original = Image.open(path).convert("RGBA")
        fixed = harden_sprite_alpha(original)
        if fixed.tobytes() != original.tobytes():
            save(fixed, path)
            hardened += 1
    return hardened


def palette_from_wall(wall: Image.Image) -> dict[str, tuple[int, int, int]]:
    rgba = wall.convert("RGBA")
    px = rgba.load()
    assert px is not None
    width, height = rgba.size
    pixels = [
        px[x, y][:3]
        for y in range(height)
        for x in range(width)
        if px[x, y][3] > 200
    ]
    if not pixels:
        return {
            "wood_dark": (62, 38, 24),
            "wood": (92, 58, 36),
            "wood_light": (122, 82, 52),
            "plaster": (232, 214, 186),
            "plaster_shade": (210, 190, 160),
        }
    by_luma = sorted(pixels, key=lambda rgb: 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2])
    n = len(by_luma)
    return {
        "wood_dark": by_luma[n // 12],
        "wood": by_luma[n // 4],
        "wood_light": by_luma[n // 3],
        "plaster": by_luma[(3 * n) // 4],
        "plaster_shade": by_luma[(2 * n) // 3],
    }


def build_side_wall_tile(side: str, palette: dict[str, tuple[int, int, int]]) -> Image.Image:
    """Project-CC0 E/W wall: continuous vertical wood + plaster (seamless when stacked).

    Avoid horizontal wainscot/crown bands — those tile into cream slabs down the
    left/right perimeter. Keep only vertical structure so stacked cells read as
    one wall column.
    """
    wood_dark = palette["wood_dark"]
    wood = palette["wood"]
    wood_light = palette["wood_light"]
    plaster = palette["plaster"]
    plaster_shade = palette["plaster_shade"]

    pixels: list[tuple[int, int, int, int]] = []
    for y in range(64):
        for x in range(64):
            local = x if side == "w" else 63 - x
            if local < 16:
                # Outer structural post — vertical grain only.
                tone = wood_dark if (local // 4) % 2 == 0 else wood
                if local in (3, 7, 11, 15):
                    tone = wood_light
                color = tone
            elif local < 46:
                # Continuous plaster face (mottle only; no horizontal rails).
                color = plaster_shade if ((local * 5) + (y * 2)) % 19 == 0 else plaster
            elif local < 50:
                color = wood_dark  # inner rail
            else:
                color = tuple(max(0, c - 20) for c in wood_dark)
            pixels.append((*color, 255))
    tile = Image.new("RGBA", (64, 64))
    tile.putdata(pixels)
    return tile



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
        return harden_sprite_alpha(clear_alpha_noise(contain(trim(keyed, 3), (80, 96))))

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

    # E/W walls need vertical structure; face-on end-cap crops tile into cream slabs.
    north = Image.open(TILE_OUT / "wall_n.png").convert("RGBA")
    palette = palette_from_wall(north)
    for side in ("e", "w"):
        sprite = build_side_wall_tile(side, palette)
        bounds = sprite.getchannel("A").getbbox()
        if bounds != (0, 0, 64, 64):
            raise ValueError(f"Architectural tile must fill its cell: wall_{side} bounds={bounds}")
        save(sprite, TILE_OUT / f"wall_{side}.png")


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
    repaired = repair_guest_crowns()
    hardened = harden_guest_frames()
    validate_animation_frames()
    build_surfaces()
    build_props()
    print("Built chibi UI assets:")
    print(f"  player frames: {len(list(PLAYER_OUT.glob('*.png')))}")
    print(f"  guest crowns repaired: {repaired}")
    print(f"  guest frames alpha-hardened: {hardened}")
    print(f"  surfaces: {len(list(TILE_OUT.glob('*.png')))}")
    print(f"  furniture: {len(list(PROP_OUT.glob('*.png')))}")


if __name__ == "__main__":
    main()
