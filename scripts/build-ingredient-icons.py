#!/usr/bin/env python3
"""Slice generated ingredient sprite sheets into atlas-ready 32×32 PNGs."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEETS_DIR = ROOT / 'vendor' / 'generated' / 'ingredient-sheets'
MANIFEST_PATH = SHEETS_DIR / 'manifest.json'
DEFAULT_OUT = ROOT / 'scripts' / '.asset-build' / 'ingredient-icons'


def is_background(r: int, g: int, b: int, a: int, threshold: int) -> bool:
    if a < 16:
        return True
    return r >= threshold and g >= threshold and b >= threshold


def trim_and_key(img: Image.Image, threshold: int) -> Image.Image:
    rgba = img.convert('RGBA')
    px = rgba.load()
    w, h = rgba.size
    min_x, min_y = w, h
    max_x, max_y = 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_background(r, g, b, a, threshold):
                px[x, y] = (0, 0, 0, 0)
            else:
                found = True
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    if not found:
        return Image.new('RGBA', (1, 1), (0, 0, 0, 0))
    return rgba.crop((min_x, min_y, max_x + 1, max_y + 1))


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


def downscale_blocky(img: Image.Image, target: int) -> Image.Image:
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

    fit = min(target / sampled.width, target / sampled.height)
    new_w = max(1, round(sampled.width * fit))
    new_h = max(1, round(sampled.height * fit))
    scaled = sampled.resize((new_w, new_h), Image.NEAREST)

    canvas = Image.new('RGBA', (target, target), (0, 0, 0, 0))
    ox = (target - new_w) // 2
    oy = (target - new_h) // 2
    canvas.paste(scaled, (ox, oy), scaled)
    return canvas


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
    threshold: int,
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
        cell = sheet.crop((x0, y0, x0 + cell_w, y0 + cell_h))
        trimmed = trim_and_key(cell, threshold)
        out[item_id] = downscale_blocky(trimmed, target)

    return out


def main() -> None:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    manifest = json.loads(MANIFEST_PATH.read_text(encoding='utf-8'))
    target = int(manifest.get('targetSize', 32))
    threshold = int(manifest.get('whiteThreshold', 240))
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
            threshold,
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
        quantized = apply_palette(icon, palette)
        rel = f'{item_id}.png'
        dest = out_dir / rel
        quantized.save(dest, optimize=True)
        manifest_out[f'icon_{item_id}'] = str(dest)

    manifest_path = out_dir / 'manifest.json'
    manifest_path.write_text(json.dumps(manifest_out, indent=2), encoding='utf-8')
    print(f'Wrote {len(manifest_out)} icons -> {out_dir}')


if __name__ == '__main__':
    main()
