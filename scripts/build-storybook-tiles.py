#!/usr/bin/env python3
"""Build seamless Storybook v2 floor and directional wall tiles."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "vendor" / "generated" / "storybook-v2" / "materials-sheet-master.png"
OUT = ROOT / "vendor" / "generated" / "storybook-v2" / "restaurant-tiles"
TILE_SIZE = 128

X_BOUNDS = ((16, 308), (320, 611), (623, 910), (923, 1214), (1226, 1520))
Y_BOUNDS = ((171, 496), (529, 853))


def swatch(sheet: Image.Image, row: int, col: int) -> Image.Image:
    x0, x1 = X_BOUNDS[col]
    y0, y1 = Y_BOUNDS[row]
    source = sheet.crop((x0 + 2, y0 + 2, x1 - 2, y1 - 2)).convert("RGB")
    side = min(source.size)
    left = (source.width - side) // 2
    top = (source.height - side) // 2
    return source.crop((left, top, left + side, top + side))


def seamless_xy(source: Image.Image) -> Image.Image:
    half = source.resize((TILE_SIZE // 2, TILE_SIZE // 2), Image.Resampling.LANCZOS)
    tile = Image.new("RGB", (TILE_SIZE, TILE_SIZE))
    tile.paste(half, (0, 0))
    tile.paste(ImageOps.mirror(half), (TILE_SIZE // 2, 0))
    tile.paste(ImageOps.flip(half), (0, TILE_SIZE // 2))
    tile.paste(ImageOps.flip(ImageOps.mirror(half)), (TILE_SIZE // 2, TILE_SIZE // 2))
    return tile


def seamless_x(source: Image.Image) -> Image.Image:
    half = source.resize((TILE_SIZE // 2, TILE_SIZE), Image.Resampling.LANCZOS)
    tile = Image.new("RGB", (TILE_SIZE, TILE_SIZE))
    tile.paste(half, (0, 0))
    tile.paste(ImageOps.mirror(half), (TILE_SIZE // 2, 0))
    return tile


def seamless_y(source: Image.Image) -> Image.Image:
    half = source.resize((TILE_SIZE, TILE_SIZE // 2), Image.Resampling.LANCZOS)
    tile = Image.new("RGB", (TILE_SIZE, TILE_SIZE))
    tile.paste(half, (0, 0))
    tile.paste(ImageOps.flip(half), (0, TILE_SIZE // 2))
    return tile


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Missing generated Storybook v2 material source: {SOURCE}")
    sheet = Image.open(SOURCE).convert("RGBA")
    if sheet.size != (1536, 1024):
        raise SystemExit(f"Unexpected material sheet size: {sheet.size}")
    OUT.mkdir(parents=True, exist_ok=True)

    tiles = {
        "floor_wood_a.png": seamless_xy(swatch(sheet, 0, 0)),
        "floor_wood_b.png": seamless_xy(swatch(sheet, 0, 1)),
        "floor_kitchen_a.png": seamless_xy(swatch(sheet, 0, 2)),
        "floor_kitchen_b.png": seamless_xy(swatch(sheet, 0, 3)),
        "wall.png": seamless_x(swatch(sheet, 0, 4)),
        "wall_n.png": seamless_x(swatch(sheet, 1, 0)),
        "wall_e.png": seamless_y(swatch(sheet, 1, 1)),
        "wall_s.png": seamless_x(swatch(sheet, 1, 2)),
        "wall_w.png": seamless_y(swatch(sheet, 1, 3)),
    }
    for filename, image in tiles.items():
        image.convert("RGBA").save(OUT / filename, optimize=True)
    print(f"Built {len(tiles)} Storybook v2 restaurant surface tiles -> {OUT}")


if __name__ == "__main__":
    main()
