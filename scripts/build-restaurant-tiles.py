#!/usr/bin/env python3
"""Generate project-CC0 indoor restaurant tiles (16×16)."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "vendor" / "generated" / "restaurant-tiles"


def wood_floor(seed_shift: int = 0) -> Image.Image:
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    colors = [(166, 120, 72), (158, 112, 66), (174, 128, 78), (150, 108, 62)]
    for y in range(16):
        c = colors[(y // 4 + seed_shift) % len(colors)]
        for x in range(16):
            im.putpixel((x, y), (*c, 255))
    for x in (0, 5, 10, 15):
        for y in range(16):
            r, g, b, _ = im.getpixel((x, y))
            im.putpixel((x, y), (max(0, r - 18), max(0, g - 14), max(0, b - 10), 255))
    for x, y in [(2, 1 + seed_shift), (7, 6), (12, 3), (3, 12), (9, 14), (13, 9)]:
        r, g, b, _ = im.getpixel((x % 16, y % 16))
        im.putpixel((x % 16, y % 16), (min(255, r + 12), min(255, g + 8), min(255, b + 4), 255))
    return im


def kitchen_floor(seed_shift: int = 0) -> Image.Image:
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    a = (210, 208, 200, 255)
    b = (188, 186, 178, 255)
    for y in range(16):
        for x in range(16):
            cell = ((x // 8) + (y // 8) + seed_shift) % 2
            im.putpixel((x, y), a if cell == 0 else b)
    d = ImageDraw.Draw(im)
    d.line([(0, 7), (15, 7)], fill=(160, 158, 150, 255))
    d.line([(7, 0), (7, 15)], fill=(160, 158, 150, 255))
    return im


def table() -> Image.Image:
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([1, 3, 14, 11], fill=(120, 78, 42, 255), outline=(90, 55, 28, 255))
    d.rectangle([2, 4, 13, 10], fill=(148, 98, 52, 255))
    d.line([(3, 5), (12, 5)], fill=(170, 120, 70, 255))
    d.rectangle([2, 11, 4, 14], fill=(80, 50, 25, 255))
    d.rectangle([11, 11, 13, 14], fill=(80, 50, 25, 255))
    return im


def chair() -> Image.Image:
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([4, 5, 11, 10], fill=(130, 85, 45, 255), outline=(90, 55, 28, 255))
    d.rectangle([4, 2, 11, 5], fill=(110, 70, 38, 255), outline=(90, 55, 28, 255))
    d.rectangle([4, 10, 6, 14], fill=(80, 50, 25, 255))
    d.rectangle([9, 10, 11, 14], fill=(80, 50, 25, 255))
    return im


def prep_station() -> Image.Image:
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([1, 5, 14, 13], fill=(170, 176, 185, 255), outline=(110, 116, 125, 255))
    d.rectangle([2, 6, 13, 9], fill=(200, 206, 214, 255))
    d.rectangle([4, 7, 10, 11], fill=(176, 130, 70, 255))
    d.line([(11, 7), (13, 10)], fill=(220, 220, 230, 255))
    return im


def equipment(accent: tuple[int, int, int]) -> Image.Image:
    im = prep_station()
    d = ImageDraw.Draw(im)
    d.rectangle([5, 3, 10, 6], fill=(*accent, 255))
    return im


def wall() -> Image.Image:
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 15, 15], fill=(92, 74, 58, 255))
    for y in (4, 9, 14):
        d.line([(0, y), (15, y)], fill=(70, 55, 42, 255))
    for x, y in [(3, 2), (10, 2), (7, 6), (2, 11), (12, 11)]:
        im.putpixel((x, y), (110, 90, 70, 255))
    return im


def door() -> Image.Image:
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([2, 1, 13, 15], fill=(96, 62, 36, 255), outline=(60, 38, 22, 255))
    d.rectangle([4, 3, 11, 8], fill=(70, 100, 130, 255))
    im.putpixel((11, 10), (200, 180, 80, 255))
    return im


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    assets = {
        "floor_wood_a": wood_floor(0),
        "floor_wood_b": wood_floor(1),
        "floor_kitchen_a": kitchen_floor(0),
        "floor_kitchen_b": kitchen_floor(1),
        "table_2seat": table(),
        "chair": chair(),
        "prep_station": prep_station(),
        "grill": equipment((180, 70, 50)),
        "oven": equipment((90, 90, 100)),
        "fryer": equipment((200, 160, 40)),
        "stockpot": equipment((70, 100, 160)),
        "cold_station": equipment((120, 180, 200)),
        "pastry_bench": equipment((220, 180, 160)),
        "smoker": equipment((90, 60, 40)),
        "wok": equipment((200, 100, 40)),
        "fermentation_crock": equipment((140, 100, 70)),
        "barista_station": equipment((60, 50, 40)),
        "spice_rack": equipment((160, 50, 50)),
        "wall": wall(),
        "door": door(),
        "decor_plant": chair(),  # placeholder replaced below
    }
    # simple plant
    plant = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(plant)
    d.rectangle([6, 10, 9, 14], fill=(120, 78, 42, 255))
    d.ellipse([3, 2, 12, 11], fill=(50, 130, 60, 255))
    assets["decor_plant"] = plant

    for name, im in assets.items():
        im.save(OUT / f"{name}.png")
        print(f"wrote {OUT / name}.png")


if __name__ == "__main__":
    main()
    sys.exit(0)
