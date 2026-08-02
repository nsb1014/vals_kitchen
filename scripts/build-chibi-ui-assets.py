#!/usr/bin/env python3
"""Build the project-CC0 chibi restaurant surfaces, furniture, décor, and actors.

The source sheets are intentionally retained in vendor/generated/chibi-ui/source so
the shipped atlases remain reproducible. This script crops, keys, and scales those
sources, and also generates project-CC0 side-wall tiles plus clipped-crown repairs
for retained guest frames.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "vendor" / "generated" / "chibi-ui" / "source"
OUT = ROOT / "vendor" / "generated" / "chibi-ui"
SEATING_SOURCE = SOURCE / "seating-rework"
PLAYER_OUT = OUT / "player-frames"
GUEST_OUT = OUT / "guest-frames"
PORTRAIT_OUT = OUT / "guest-portraits"
TILE_OUT = OUT / "restaurant-tiles"
PROP_OUT = OUT / "restaurant-props"

ACTOR_FRAME_SIZE = (128, 160)
PORTRAIT_SIZE = (96, 96)


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


def flood_remove_white_background(
    image: Image.Image,
    *,
    include_gray_spill: bool = True,
) -> Image.Image:
    """Remove only border-connected white matte and decontaminate its edge.

    Global white chroma-keying damages Val's pale skin and floral dress. The
    source matte is contiguous with the crop border, while the character is
    enclosed by its authored outline, so flood segmentation preserves every
    interior color and removes only the actual background/fringe.
    """
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    assert pixels is not None
    background = (253, 253, 253)

    def is_matte(x: int, y: int) -> bool:
        red, green, blue, _ = pixels[x, y]
        distance = (
            (red - background[0]) ** 2
            + (green - background[1]) ** 2
            + (blue - background[2]) ** 2
        ) ** 0.5
        channel_min = min(red, green, blue)
        channel_spread = max(red, green, blue) - channel_min
        near_white = channel_min >= 190 and distance <= 82
        # The supplied white matte was resampled before delivery. Its outer
        # edge therefore contains a connected gray, low-chroma band that is
        # darker than the near-white key above. Remove that band only while it
        # remains connected to the crop border; Val's authored dark outline
        # encloses and protects the hair, skin, dress, hands, and shoes.
        gray_spill = (
            include_gray_spill and channel_min >= 110 and channel_spread <= 38
        )
        return near_white or gray_spill

    matte = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        for y in (0, height - 1):
            if is_matte(x, y) and not matte[y][x]:
                matte[y][x] = True
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if is_matte(x, y) and not matte[y][x]:
                matte[y][x] = True
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for nx in range(max(0, x - 1), min(width, x + 2)):
            for ny in range(max(0, y - 1), min(height, y + 2)):
                if matte[ny][nx] or not is_matte(nx, ny):
                    continue
                matte[ny][nx] = True
                queue.append((nx, ny))

    out = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    out_pixels = out.load()
    assert out_pixels is not None
    for y in range(height):
        for x in range(width):
            if matte[y][x]:
                continue
            red, green, blue, source_alpha = pixels[x, y]
            touches_matte = any(
                matte[ny][nx]
                for nx in range(max(0, x - 1), min(width, x + 2))
                for ny in range(max(0, y - 1), min(height, y + 2))
            )
            alpha = source_alpha
            if touches_matte:
                distance = (
                    (red - background[0]) ** 2
                    + (green - background[1]) ** 2
                    + (blue - background[2]) ** 2
                ) ** 0.5
                alpha = min(source_alpha, max(0, min(255, round((distance - 35) * 255 / 70))))
            if alpha <= 8:
                continue
            if alpha < 255:
                opacity = alpha / 255
                red = max(0, min(255, round((red - (1 - opacity) * background[0]) / opacity)))
                green = max(0, min(255, round((green - (1 - opacity) * background[1]) / opacity)))
                blue = max(0, min(255, round((blue - (1 - opacity) * background[2]) / opacity)))
            out_pixels[x, y] = (red, green, blue, alpha)
    return out


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


def trim_to_reference(
    image: Image.Image,
    reference: Image.Image,
    padding: int = 0,
) -> Image.Image:
    """Crop cleaned pixels without letting cleanup change authored scale/alignment."""
    bounds = reference.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Reference sprite crop contains no visible pixels")
    left, top, right, bottom = bounds
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


def contain_at_scale(
    image: Image.Image,
    size: tuple[int, int],
    scale: float,
    bottom_pad: int = 4,
) -> Image.Image:
    """Place a sprite at a shared authored scale and a shared feet baseline."""
    target_w, target_h = size
    resized = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )
    if resized.width > target_w or resized.height + bottom_pad > target_h:
        raise ValueError(
            f"Shared actor scale does not fit {size}: {resized.size} at {scale:.4f}"
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


def alpha_content_runs(
    image: Image.Image,
    axis: str,
    cutoff: int = 20,
) -> list[tuple[int, int]]:
    """Find real transparent gutters instead of assuming generated grid cuts."""
    alpha = image.getchannel("A").point(lambda value: 255 if value >= cutoff else 0)
    length = image.height if axis == "rows" else image.width
    occupied: list[int] = []
    for index in range(length):
        band = (
            alpha.crop((0, index, image.width, index + 1))
            if axis == "rows"
            else alpha.crop((index, 0, index + 1, image.height))
        )
        if band.getbbox() is not None:
            occupied.append(index)

    runs: list[list[int]] = []
    for index in occupied:
        if not runs or index > runs[-1][1] + 1:
            runs.append([index, index])
        else:
            runs[-1][1] = index
    return [(start, end + 1) for start, end in runs]


def authored_grid_boxes(
    image: Image.Image,
    columns: int,
    rows: int,
    padding: int = 4,
) -> list[list[tuple[int, int, int, int]]]:
    """Return content-aware boxes for an evenly arranged generated asset board."""
    column_runs = alpha_content_runs(image, "cols")
    row_runs = alpha_content_runs(image, "rows")
    if len(column_runs) != columns or len(row_runs) != rows:
        raise ValueError(
            f"Expected {columns}x{rows} authored grid, found "
            f"{len(column_runs)}x{len(row_runs)}"
        )
    return [
        [
            (
                max(0, x0 - padding),
                max(0, y0 - padding),
                min(image.width, x1 + padding),
                min(image.height, y1 + padding),
            )
            for x0, x1 in column_runs
        ]
        for y0, y1 in row_runs
    ]


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
    if visible_height < 138 or not 4 <= bottom_gap <= 8:
        raise ValueError(
            f"Player frame is not feet-normalized: {name} "
            f"(bounds={bounds}, visible_height={visible_height}, bottom_gap={bottom_gap})"
        )
    neutral_matte_fringe = 0
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = image.getpixel((x, y))
            # The resampled source matte includes a medium-gray connected band,
            # not just near-white pixels. Check the full neutral spill range
            # that is visible against the restaurant's dark wood floor.
            if alpha == 0 or min(red, green, blue) <= 160:
                continue
            if max(red, green, blue) - min(red, green, blue) >= 45:
                continue
            if any(
                image.getpixel((nx, ny))[3] == 0
                for nx in range(max(0, x - 1), min(image.width, x + 2))
                for ny in range(max(0, y - 1), min(image.height, y + 2))
            ):
                neutral_matte_fringe += 1
    # A carried white plate can contribute an isolated legitimate edge pixel;
    # the failed source matte appears as a continuous multi-pixel halo.
    if neutral_matte_fringe > 3:
        raise ValueError(
            f"Player frame retains a neutral matte fringe: "
            f"{name} ({neutral_matte_fringe}px)"
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
                if min(margins) < 4:
                    raise ValueError(f"Guest animation frame is clipped: {name} margins={margins}")
                heights.append(bounds[3] - bounds[1])
            if max(heights) - min(heights) > 10:
                raise ValueError(
                    f"Guest walk cycle changes crop height: {variant} {facing} {heights}"
                )
        for facing in ("down", "right", "left", "up"):
            sit_path = GUEST_OUT / f"guest_{variant}_sit_{facing}.png"
            image = Image.open(sit_path).convert("RGBA")
            bounds = image.getchannel("A").getbbox()
            if bounds is None:
                raise ValueError(f"Guest sit frame is empty: {sit_path.name}")
            margins = (
                bounds[0],
                bounds[1],
                image.width - bounds[2],
                image.height - bounds[3],
            )
            if min(margins) < 4:
                raise ValueError(f"Guest sit frame is clipped: {sit_path.name} margins={margins}")


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

    def player_source_frame(column: int, facing: str) -> Image.Image:
        x0, x1 = column_bounds[column]
        y0, y1 = facing_rows[facing]
        source = sheet.crop((x0, y0, x1, y1))
        keyed = clear_alpha_noise(flood_remove_white_background(source))
        # The stronger spill cleanup must not change frame dimensions, shared
        # actor scale, or feet alignment. Use the former near-white-only matte
        # as the layout reference, then crop the cleaned pixels to that box.
        layout_reference = clear_alpha_noise(
            flood_remove_white_background(source, include_gray_spill=False)
        )
        return trim_to_reference(keyed, layout_reference, 3)

    source_frames = {
        (facing, column): player_source_frame(column, facing)
        for facing in facing_rows
        for column in (0, 1, 2, 4)
    }
    max_w = max(frame.width for frame in source_frames.values())
    max_h = max(frame.height for frame in source_frames.values())
    scale = min(
        (ACTOR_FRAME_SIZE[0] - 8) / max_w,
        (ACTOR_FRAME_SIZE[1] - 8) / max_h,
    )

    def player_frame(column: int, facing: str) -> Image.Image:
        # The source was composited against white before it reached us. A firm
        # final cutoff removes that low-opacity residual matte after resizing;
        # the retained pixels still carry the source's own smooth linework.
        return clear_alpha_noise(
            contain_at_scale(source_frames[(facing, column)], ACTOR_FRAME_SIZE, scale),
            cutoff=120,
        )

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


def build_guests() -> None:
    """Crop the coordinated cast sheets without changing scale between poses."""
    row_facings = ("down", "right", "left", "up")
    for variant in ("a", "b", "c", "d", "e"):
        sheet_path = SEATING_SOURCE / f"guest-{variant}-sheet-transparent.png"
        sheet = clear_alpha_noise(Image.open(sheet_path).convert("RGBA"))
        if sheet.size != (1536, 1024):
            raise SystemExit(f"Unexpected guest sheet size: {sheet_path} {sheet.size}")
        boxes = authored_grid_boxes(sheet, columns=4, rows=4)

        sources: dict[tuple[str, int], Image.Image] = {}
        for row, facing in enumerate(row_facings):
            for column in range(4):
                cell = sheet.crop(boxes[row][column])
                sources[(facing, column)] = trim(cell, 3)

        standing = [
            source
            for (facing, column), source in sources.items()
            if column < 3
        ]
        max_w = max(frame.width for frame in standing)
        max_h = max(frame.height for frame in standing)
        scale = min(
            (ACTOR_FRAME_SIZE[0] - 8) / max_w,
            (ACTOR_FRAME_SIZE[1] - 8) / max_h,
        )

        for facing in row_facings:
            for frame in range(3):
                sprite = contain_at_scale(sources[(facing, frame)], ACTOR_FRAME_SIZE, scale)
                save(sprite, GUEST_OUT / f"guest_{variant}_{facing}_{frame}.png")
            seated = contain_at_scale(sources[(facing, 3)], ACTOR_FRAME_SIZE, scale)
            save(seated, GUEST_OUT / f"guest_{variant}_sit_{facing}.png")

        down = Image.open(GUEST_OUT / f"guest_{variant}_down_0.png").convert("RGBA")
        bounds = down.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"Guest portrait source is empty: {variant}")
        left, top, right, bottom = bounds
        head_bottom = min(bottom, top + round((bottom - top) * 0.56))
        head = down.crop((left, top, right, head_bottom))
        save(contain(head, PORTRAIT_SIZE, bottom_pad=4), PORTRAIT_OUT / f"guest_{variant}.png")

    save(Image.open(GUEST_OUT / "guest_a_down_0.png"), GUEST_OUT / "customer.png")
    save(Image.open(GUEST_OUT / "guest_b_down_0.png"), GUEST_OUT / "customer_b.png")


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
    seating_sheet = Image.open(
        SEATING_SOURCE / "furniture-sheet-transparent.png"
    ).convert("RGBA")
    table_sheet = Image.open(
        SEATING_SOURCE / "table-states-v2-transparent.png"
    ).convert("RGBA")
    decor_sheet = Image.open(SOURCE / "decor-sheet-v2-transparent.png").convert("RGBA")
    equipment_sheet = Image.open(
        SOURCE / "equipment-extension-v2-transparent.png"
    ).convert("RGBA")
    if sheet.size != (1536, 1024):
        raise SystemExit(f"Unexpected furniture sheet size: {sheet.size}")
    if seating_sheet.size != (1536, 1024):
        raise SystemExit(f"Unexpected seating furniture sheet size: {seating_sheet.size}")
    if table_sheet.size != (1536, 1024):
        raise SystemExit(f"Unexpected table state sheet size: {table_sheet.size}")
    if decor_sheet.size != (1717, 916):
        raise SystemExit(f"Unexpected coordinated décor sheet size: {decor_sheet.size}")
    if equipment_sheet.size != (1536, 1024):
        raise SystemExit(
            f"Unexpected coordinated equipment sheet size: {equipment_sheet.size}"
        )

    def validate_transparent_sheet(image: Image.Image, label: str) -> None:
        corners = (
            image.getpixel((0, 0)),
            image.getpixel((image.width - 1, 0)),
            image.getpixel((0, image.height - 1)),
            image.getpixel((image.width - 1, image.height - 1)),
        )
        if any(pixel[3] != 0 for pixel in corners):
            raise ValueError(f"{label} does not have transparent corners")
        key_residual = sum(
            1
            for red, green, blue, alpha in image.get_flattened_data()
            if alpha > 0 and red > 230 and blue > 230 and green < 80
        )
        if key_residual > 0:
            raise ValueError(f"{label} retains magenta key spill ({key_residual}px)")

    validate_transparent_sheet(decor_sheet, "Coordinated décor sheet")
    validate_transparent_sheet(equipment_sheet, "Coordinated equipment sheet")

    seating_sheet = clear_alpha_noise(seating_sheet)
    seating_boxes = authored_grid_boxes(seating_sheet, columns=4, rows=2)
    table_sheet = clear_alpha_noise(table_sheet)
    table_boxes = authored_grid_boxes(table_sheet, columns=4, rows=1)
    seating_cells = {
        # Keep legacy texture keys; these assets are intentionally backless stools.
        "chair": (0, 1),
        "chair_back": (1, 1),
        "chair_side": (2, 1),
    }
    for name, (column, row) in seating_cells.items():
        cell = seating_sheet.crop(seating_boxes[row][column])
        sprite = contain(trim(cell, 2), (72, 88), bottom_pad=3)
        save(sprite, PROP_OUT / f"{name}.png")

    table_cells = {
        "table_2seat_unset": 0,
        "table_2seat": 1,
        "table_2seat_occupied": 2,
        "table_2seat_dirty": 3,
    }
    for name, column in table_cells.items():
        cell = table_sheet.crop(table_boxes[0][column])
        sprite = contain(trim(cell, 2), (96, 96), bottom_pad=3)
        save(sprite, PROP_OUT / f"{name}.png")

    # These five props were generated together against the current furniture
    # reference so optional decoration no longer drops to the legacy 32×48
    # pixel-art detail level. Preserve different source canvases here; runtime
    # sizing then keeps a rug broad, a vase small, and a lamp actor-height.
    decor_sheet = clear_alpha_noise(decor_sheet, cutoff=12)
    decor_boxes = authored_grid_boxes(decor_sheet, columns=5, rows=1, padding=8)
    decor_cells = {
        "decor_plant": (0, (80, 104)),
        "decor_flowers": (1, (64, 80)),
        "decor_lamp": (2, (72, 108)),
        "decor_rug": (3, (104, 72)),
        "decor_sign": (4, (80, 104)),
    }
    for name, (column, target) in decor_cells.items():
        cell = decor_sheet.crop(decor_boxes[0][column])
        sprite = contain(trim(cell, 3), target, bottom_pad=3)
        save(sprite, PROP_OUT / f"{name}.png")

    # The smoker and spice rack were the final two equipment textures still
    # sourced from the legacy 32×48 pixel set. They were authored together at
    # the same perspective and scale as the current chibi station family.
    equipment_sheet = clear_alpha_noise(equipment_sheet, cutoff=12)
    equipment_boxes = authored_grid_boxes(equipment_sheet, columns=2, rows=1, padding=8)
    for name, column in {"smoker": 0, "spice_rack": 1}.items():
        cell = equipment_sheet.crop(equipment_boxes[0][column])
        sprite = contain(trim(cell, 3), (64, 96), bottom_pad=2)
        save(sprite, PROP_OUT / f"{name}.png")

    boxes = {
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
        "decor-sheet-v2-transparent.png",
        "equipment-extension-v2-transparent.png",
    ):
        if not (SOURCE / required).is_file():
            raise SystemExit(f"Missing chibi source sheet: {SOURCE / required}")
    for variant in ("a", "b", "c", "d", "e"):
        required = SEATING_SOURCE / f"guest-{variant}-sheet-transparent.png"
        if not required.is_file():
            raise SystemExit(f"Missing coordinated guest sheet: {required}")
    if not (SEATING_SOURCE / "furniture-sheet-transparent.png").is_file():
        raise SystemExit("Missing coordinated seating furniture sheet")
    if not (SEATING_SOURCE / "table-states-v2-transparent.png").is_file():
        raise SystemExit("Missing corrected oval table state sheet")
    build_player()
    build_guests()
    validate_animation_frames()
    build_surfaces()
    build_props()
    print("Built chibi UI assets:")
    print(f"  player frames: {len(list(PLAYER_OUT.glob('*.png')))}")
    print(f"  coordinated guest frames: {len(list(GUEST_OUT.glob('guest_*.png')))}")
    print(f"  guest portraits: {len(list(PORTRAIT_OUT.glob('*.png')))}")
    print(f"  surfaces: {len(list(TILE_OUT.glob('*.png')))}")
    print(f"  furniture: {len(list(PROP_OUT.glob('*.png')))}")


if __name__ == "__main__":
    main()
