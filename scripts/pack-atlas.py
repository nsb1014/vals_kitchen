#!/usr/bin/env python3
"""Pack PNG sprites into a PixiJS-compatible spritesheet + JSON atlas."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image


def pack_atlas(
    entries: list[tuple[str, Path]],
    out_png: Path,
    out_json: Path,
    cell: int | None = None,
    scale: int = 1,
) -> None:
    if not entries:
        raise SystemExit('No entries to pack')
    if scale < 1:
        raise SystemExit(f'Invalid scale: {scale}')

    images: list[tuple[str, Image.Image]] = []
    for name, path in entries:
        img = Image.open(path).convert('RGBA')
        if scale > 1:
            img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
        images.append((name, img))

    max_w = max(img.width for _, img in images)
    max_h = max(img.height for _, img in images)
    if cell is None:
        cell = max(max_w, max_h)

    count = len(images)
    cols = max(1, math.ceil(math.sqrt(count)))
    rows = math.ceil(count / cols)
    sheet_w = cols * cell
    sheet_h = rows * cell

    if sheet_w > 2048 or sheet_h > 2048:
        raise SystemExit(f'Atlas exceeds 2048 limit: {sheet_w}x{sheet_h}')

    sheet = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))
    frames: dict[str, dict] = {}

    for index, (name, img) in enumerate(images):
        col = index % cols
        row = index // cols
        x = col * cell
        y = row * cell
        sheet.paste(img, (x, y), img)
        frames[name] = {
            'frame': {'x': x, 'y': y, 'w': img.width, 'h': img.height},
            'rotated': False,
            'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': img.width, 'h': img.height},
            'sourceSize': {'w': img.width, 'h': img.height},
        }

    out_png.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_png, optimize=True)

    atlas = {
        'frames': frames,
        'meta': {
            'app': 'restaurant-simulator/build-assets',
            'version': '1.0',
            'image': out_png.name,
            'format': 'RGBA8888',
            'size': {'w': sheet_w, 'h': sheet_h},
            'scale': '1',
        },
    }
    out_json.write_text(json.dumps(atlas, indent=2), encoding='utf-8')
    print(f'Packed {count} sprites -> {out_png} ({sheet_w}x{sheet_h})')


def main() -> None:
    if len(sys.argv) < 4:
        raise SystemExit('Usage: pack-atlas.py <manifest.json> <out.png> <out.json> [cell] [scale]')

    manifest_path = Path(sys.argv[1])
    out_png = Path(sys.argv[2])
    out_json = Path(sys.argv[3])
    cell = int(sys.argv[4]) if len(sys.argv) > 4 else None
    scale = int(sys.argv[5]) if len(sys.argv) > 5 else 1

    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    entries: list[tuple[str, Path]] = []
    for name, rel in manifest.items():
        path = Path(rel)
        if not path.is_file():
            raise SystemExit(f'Missing source: {path}')
        entries.append((name, path))

    pack_atlas(entries, out_png, out_json, cell, scale)


if __name__ == '__main__':
    main()
