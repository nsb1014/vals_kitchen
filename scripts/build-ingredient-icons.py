#!/usr/bin/env python3
"""Slice generated ingredient sprite sheets into atlas-ready 32×32 PNGs."""

from __future__ import annotations

from collections import deque
import json
import math
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEETS_DIR = ROOT / 'vendor' / 'generated' / 'ingredient-sheets'
MANIFEST_PATH = SHEETS_DIR / 'manifest.json'
DEFAULT_OUT = ROOT / 'scripts' / '.asset-build' / 'ingredient-icons'


ICON_PADDING = 2
OVERFLOW_PX = 48
WHITE_MIN = 248
WHITE_CHROMA_MAX = 10


def is_white_matte(red: int, green: int, blue: int, alpha: int) -> bool:
    if alpha < 16:
        return True
    return min(red, green, blue) >= WHITE_MIN and max(red, green, blue) - min(
        red, green, blue
    ) <= WHITE_CHROMA_MAX


def is_content_pixel(red: int, green: int, blue: int, alpha: int) -> bool:
    return not is_white_matte(red, green, blue, alpha)


def flood_remove_white_matte(image: Image.Image) -> Image.Image:
    """Remove only border-connected white sheet matte.

    Global white keying punches holes in garlic, butter, rice, and chicken
    highlights and leaves a near-white fringe. Flooding from the crop border
    keeps pale food interiors.
    """
    rgba = image.convert('RGBA')
    width, height = rgba.size
    pixels = rgba.load()
    assert pixels is not None
    matte = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()

    def consider(x: int, y: int) -> None:
        if matte[y][x]:
            return
        red, green, blue, alpha = pixels[x, y]
        if not is_white_matte(red, green, blue, alpha):
            return
        matte[y][x] = True
        queue.append((x, y))

    for x in range(width):
        consider(x, 0)
        consider(x, height - 1)
    for y in range(height):
        consider(0, y)
        consider(width - 1, y)

    while queue:
        x, y = queue.popleft()
        for nx in range(max(0, x - 1), min(width, x + 2)):
            for ny in range(max(0, y - 1), min(height, y + 2)):
                consider(nx, ny)

    out = Image.new('RGBA', rgba.size, (0, 0, 0, 0))
    out_pixels = out.load()
    assert out_pixels is not None
    for y in range(height):
        for x in range(width):
            if matte[y][x]:
                continue
            red, green, blue, alpha = pixels[x, y]
            touches_matte = any(
                matte[ny][nx]
                for nx in range(max(0, x - 1), min(width, x + 2))
                for ny in range(max(0, y - 1), min(height, y + 2))
            )
            if touches_matte:
                chroma = max(red, green, blue) - min(red, green, blue)
                if min(red, green, blue) >= 220 and chroma <= 28:
                    opaque_neighbors = sum(
                        1
                        for nx in range(max(0, x - 1), min(width, x + 2))
                        for ny in range(max(0, y - 1), min(height, y + 2))
                        if not matte[ny][nx] and pixels[nx, ny][3] >= 16
                    )
                    if opaque_neighbors <= 3:
                        continue
            out_pixels[x, y] = (red, green, blue, 255 if alpha >= 16 else 0)
    return out


def strip_isolated_fringe(image: Image.Image) -> Image.Image:
    """Peel a one-pixel pale halo that still touches transparency.

    Connected matte crumbs survive an isolated-speck filter; a single peel of
    near-neutral edge pixels keeps garlic/rice interiors and black outlines.
    """
    rgba = image.convert('RGBA')
    pixels = rgba.load()
    assert pixels is not None
    width, height = rgba.size
    to_clear: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            chroma = max(red, green, blue) - min(red, green, blue)
            luma = 0.3 * red + 0.59 * green + 0.11 * blue
            if luma < 175 or chroma > 48:
                continue
            touches_clear = x in (0, width - 1) or y in (0, height - 1)
            if not touches_clear:
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    for ny in range(max(0, y - 1), min(height, y + 2)):
                        if pixels[nx, ny][3] == 0:
                            touches_clear = True
                            break
                    if touches_clear:
                        break
            if touches_clear:
                to_clear.append((x, y))
    for x, y in to_clear:
        pixels[x, y] = (0, 0, 0, 0)
    return rgba


def extract_connected_item(
    sheet: Image.Image,
    cell: tuple[int, int, int, int],
    overflow: int = OVERFLOW_PX,
) -> Image.Image:
    """Keep pixels connected to this cell, including a little neighbor overflow.

    Equal grid cuts clip dishes that spill a few pixels into the next cell
    (butter's plate rim). Growing the connected component into a bounded
    overflow band restores those rims without swallowing the next ingredient.
    """
    sheet_rgba = sheet.convert('RGBA')
    sheet_px = sheet_rgba.load()
    assert sheet_px is not None
    cell_x0, cell_y0, cell_x1, cell_y1 = cell
    x0 = max(0, cell_x0 - overflow)
    y0 = max(0, cell_y0 - overflow)
    x1 = min(sheet_rgba.width, cell_x1 + overflow)
    y1 = min(sheet_rgba.height, cell_y1 + overflow)
    width, height = x1 - x0, y1 - y0
    visited = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()

    def in_overflow(sx: int, sy: int) -> bool:
        return x0 <= sx < x1 and y0 <= sy < y1

    def in_cell(sx: int, sy: int) -> bool:
        return cell_x0 <= sx < cell_x1 and cell_y0 <= sy < cell_y1

    for sy in range(cell_y0, cell_y1):
        for sx in range(cell_x0, cell_x1):
            red, green, blue, alpha = sheet_px[sx, sy]
            if not is_content_pixel(red, green, blue, alpha):
                continue
            lx, ly = sx - x0, sy - y0
            visited[ly][lx] = True
            queue.append((sx, sy))

    while queue:
        sx, sy = queue.popleft()
        for nx in range(sx - 1, sx + 2):
            for ny in range(sy - 1, sy + 2):
                if not in_overflow(nx, ny):
                    continue
                lx, ly = nx - x0, ny - y0
                if visited[ly][lx]:
                    continue
                red, green, blue, alpha = sheet_px[nx, ny]
                if not is_content_pixel(red, green, blue, alpha):
                    continue
                # Do not walk deep into a neighboring cell's interior.
                if not in_cell(nx, ny):
                    if abs(nx - cell_x0) > overflow and abs(nx - (cell_x1 - 1)) > overflow:
                        continue
                    if abs(ny - cell_y0) > overflow and abs(ny - (cell_y1 - 1)) > overflow:
                        continue
                visited[ly][lx] = True
                queue.append((nx, ny))

    out = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    out_px = out.load()
    assert out_px is not None
    found = False
    min_x, min_y, max_x, max_y = width, height, 0, 0
    for ly in range(height):
        for lx in range(width):
            if not visited[ly][lx]:
                continue
            found = True
            min_x = min(min_x, lx)
            min_y = min(min_y, ly)
            max_x = max(max_x, lx)
            max_y = max(max_y, ly)
            red, green, blue, alpha = sheet_px[x0 + lx, y0 + ly]
            out_px[lx, ly] = (red, green, blue, 255 if alpha >= 16 else 0)
    if not found:
        return Image.new('RGBA', (1, 1), (0, 0, 0, 0))
    cropped = out.crop((min_x, min_y, max_x + 1, max_y + 1))
    return strip_isolated_fringe(flood_remove_white_matte(cropped))


def estimate_block_size(img: Image.Image) -> int:
    """Estimate chunky pixel block size from horizontal color runs."""
    rgba = img.convert('RGBA')
    px = rgba.load()
    w, h = rgba.size
    runs: list[int] = []
    for y in range(h):
        x = 0
        while x < w:
            if px[x, y][3] == 0:
                x += 1
                continue
            start = x
            color = px[x, y][:3]
            while x < w and px[x, y][3] > 0 and px[x, y][:3] == color:
                x += 1
            run = x - start
            if run >= 2:
                runs.append(run)
    if not runs:
        return 1
    runs.sort()
    return max(1, runs[len(runs) // 2])


def downscale_blocky(img: Image.Image, target: int, padding: int = ICON_PADDING) -> Image.Image:
    """Downscale via block-centre sampling for crisp pixel art."""
    if img.width == 0 or img.height == 0:
        return Image.new('RGBA', (target, target), (0, 0, 0, 0))

    block = estimate_block_size(img)
    # Sample one pixel per logical block from source.
    logical_w = max(1, math.ceil(img.width / block))
    logical_h = max(1, math.ceil(img.height / block))
    sampled = Image.new('RGBA', (logical_w, logical_h), (0, 0, 0, 0))
    spx = sampled.load()
    src = img.load()
    for ly in range(logical_h):
        for lx in range(logical_w):
            sx = min(img.width - 1, lx * block + block // 2)
            sy = min(img.height - 1, ly * block + block // 2)
            spx[lx, ly] = src[sx, sy]

    inner = max(1, target - padding * 2)
    fit = min(inner / sampled.width, inner / sampled.height)
    new_w = max(1, round(sampled.width * fit))
    new_h = max(1, round(sampled.height * fit))
    scaled = sampled.resize((new_w, new_h), Image.NEAREST)

    canvas = Image.new('RGBA', (target, target), (0, 0, 0, 0))
    ox = (target - new_w) // 2
    oy = (target - new_h) // 2
    canvas.paste(scaled, (ox, oy), scaled)
    return strip_isolated_fringe(canvas)


def build_shared_palette(icons: list[Image.Image], colors: int) -> list[tuple[int, int, int, int]]:
    composite_w = target = 32
    strip = Image.new('RGBA', (composite_w * len(icons), target), (0, 0, 0, 0))
    for i, icon in enumerate(icons):
        strip.paste(icon, (i * target, 0), icon)

    rgb_strip = Image.new('RGB', strip.size, (255, 255, 255))
    rgb_strip.paste(strip, mask=strip.split()[3])
    quantized = rgb_strip.quantize(colors=colors, method=Image.MEDIANCUT)
    palette = quantized.getpalette()
    if palette is None:
        return [(0, 0, 0, 255)]

    out: list[tuple[int, int, int, int]] = []
    for i in range(0, min(len(palette), colors * 3), 3):
        out.append((palette[i], palette[i + 1], palette[i + 2], 255))
    return out


def nearest_color(r: int, g: int, b: int, palette: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int]:
    best = palette[0]
    best_dist = float('inf')
    for pr, pg, pb, pa in palette:
        dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if dist < best_dist:
            best_dist = dist
            best = (pr, pg, pb, pa)
    return best


def apply_palette(img: Image.Image, palette: list[tuple[int, int, int, int]]) -> Image.Image:
    rgba = img.convert('RGBA')
    px = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            px[x, y] = nearest_color(r, g, b, palette)
    return rgba


def slice_sheet(
    sheet_path: Path,
    cols: int,
    rows: int,
    items: list[str],
    target: int,
) -> dict[str, Image.Image]:
    sheet = Image.open(sheet_path).convert('RGBA')
    sw, sh = sheet.size
    cell_w = sw // cols
    cell_h = sh // rows
    out: dict[str, Image.Image] = {}

    for index, item_id in enumerate(items):
        col = index % cols
        row = index // cols
        x0 = col * cell_w
        y0 = row * cell_h
        extracted = extract_connected_item(
            sheet,
            (x0, y0, x0 + cell_w, y0 + cell_h),
        )
        out[item_id] = downscale_blocky(extracted, target)

    return out


def main() -> None:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    manifest = json.loads(MANIFEST_PATH.read_text(encoding='utf-8'))
    target = int(manifest.get('targetSize', 32))
    palette_colors = int(manifest.get('paletteColors', 64))

    icons: dict[str, Image.Image] = {}
    for spec in manifest['sheets']:
        sheet_path = SHEETS_DIR / spec['file']
        if not sheet_path.is_file():
            raise SystemExit(f'Missing sheet: {sheet_path}')
        sliced = slice_sheet(
            sheet_path,
            int(spec['cols']),
            int(spec['rows']),
            spec['items'],
            target,
        )
        icons.update(sliced)
        print(f'Sliced {spec["file"]}: {len(spec["items"])} icons')

    if len(icons) != 100:
        raise SystemExit(f'Expected 100 icons, got {len(icons)}')

    ordered = sorted(icons.items(), key=lambda kv: kv[0])
    palette = build_shared_palette([img for _, img in ordered], palette_colors)
    print(f'Shared palette: {len(palette)} colors')

    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_out: dict[str, str] = {}
    for item_id, icon in ordered:
        quantized = strip_isolated_fringe(apply_palette(icon, palette))
        rel = f'{item_id}.png'
        dest = out_dir / rel
        quantized.save(dest, optimize=True)
        manifest_out[f'icon_{item_id}'] = str(dest)

    manifest_path = out_dir / 'manifest.json'
    manifest_path.write_text(json.dumps(manifest_out, indent=2), encoding='utf-8')
    print(f'Wrote {len(manifest_out)} icons -> {out_dir}')


if __name__ == '__main__':
    main()
