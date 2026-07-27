#!/usr/bin/env python3
"""Generate 48×48 project-CC0 pixel-art achievement badges."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = (
    Path(sys.argv[1]).resolve()
    if len(sys.argv) > 1
    else ROOT / "vendor" / "generated" / "achievement-badges"
)

SIZE = 48
TRANSPARENT = (0, 0, 0, 0)
CHAR = (52, 46, 42, 255)
WALNUT_D = (88, 54, 30, 255)
WALNUT = (118, 76, 44, 255)
WALNUT_HI = (148, 100, 60, 255)
CREAM = (240, 232, 214, 255)
CREAM_D = (222, 210, 188, 255)
BRASS = (208, 172, 76, 255)
BRASS_HI = (236, 204, 110, 255)

FAMILY_COLORS = {
    "recipe-unlocks": ((196, 132, 76, 255), (232, 178, 108, 255)),
    "recipe-mastery-5": ((92, 132, 88, 255), (156, 176, 142, 255)),
    "recipe-mastery-10": ((166, 116, 52, 255), BRASS_HI),
    "decor": ((166, 74, 66, 255), (214, 112, 94, 255)),
    "tables": (WALNUT, WALNUT_HI),
    "days": ((74, 116, 126, 255), (130, 164, 166, 255)),
    "prestiges": ((112, 84, 132, 255), (168, 132, 180, 255)),
}

BADGES = {
    **{f"recipe-unlocks-{n}": ("recipe-unlocks", n) for n in (1, 5, 10, 25, 50, 100)},
    **{f"recipe-mastery-5-{n}": ("recipe-mastery-5", n) for n in (1, 5, 10)},
    **{f"recipe-mastery-10-{n}": ("recipe-mastery-10", n) for n in (1, 3, 5)},
    **{f"decor-{n}": ("decor", n) for n in (1, 3, 6)},
    **{f"tables-{n}": ("tables", n) for n in (3, 5, 8)},
    **{f"days-{n}": ("days", n) for n in (1, 7, 14, 30)},
    **{f"prestiges-{n}": ("prestiges", n) for n in (1, 3, 5)},
}

DIGITS = {
    "0": ("111", "101", "101", "101", "111"),
    "1": ("010", "110", "010", "010", "111"),
    "2": ("111", "001", "111", "100", "111"),
    "3": ("111", "001", "111", "001", "111"),
    "4": ("101", "101", "111", "001", "001"),
    "5": ("111", "100", "111", "001", "111"),
    "6": ("111", "100", "111", "101", "111"),
    "7": ("111", "001", "010", "010", "010"),
    "8": ("111", "101", "111", "101", "111"),
    "9": ("111", "101", "111", "001", "111"),
}


def draw_number(
    image: Image.Image,
    value: int,
    color: tuple[int, int, int, int],
) -> None:
    text = str(value)
    scale = 5 if len(text) == 1 else 4 if len(text) == 2 else 3
    unit_width = len(text) * 3 + (len(text) - 1)
    width = unit_width * scale
    height = 5 * scale
    x0 = (SIZE - width) // 2
    y0 = 17 + (21 - height) // 2
    draw = ImageDraw.Draw(image)
    for digit_index, digit in enumerate(text):
        digit_x = x0 + digit_index * 4 * scale
        for row, pixels in enumerate(DIGITS[digit]):
            for column, pixel in enumerate(pixels):
                if pixel == "1":
                    x = digit_x + column * scale
                    y = y0 + row * scale
                    draw.rectangle(
                        [x, y, x + scale - 1, y + scale - 1],
                        fill=color,
                    )


def draw_family_mark(
    draw: ImageDraw.ImageDraw,
    family_name: str,
    tint: tuple[int, int, int, int],
) -> None:
    if family_name == "recipe-unlocks":
        draw.rectangle([19, 6, 29, 10], fill=CREAM)
        draw.line([(21, 8), (27, 8)], fill=tint, width=1)
    elif family_name.startswith("recipe-mastery"):
        draw.polygon(
            [(24, 4), (26, 7), (30, 7), (27, 10), (28, 13), (24, 11),
             (20, 13), (21, 10), (18, 7), (22, 7)],
            fill=BRASS_HI,
        )
    elif family_name == "decor":
        draw.ellipse([19, 5, 24, 11], fill=(112, 166, 100, 255))
        draw.ellipse([24, 4, 29, 10], fill=(148, 190, 126, 255))
        draw.line([(24, 8), (24, 13)], fill=WALNUT_D, width=1)
    elif family_name == "tables":
        draw.rectangle([18, 6, 30, 9], fill=CREAM)
        draw.rectangle([20, 9, 21, 13], fill=CREAM_D)
        draw.rectangle([27, 9, 28, 13], fill=CREAM_D)
    elif family_name == "days":
        draw.rectangle([19, 5, 29, 12], fill=CREAM)
        draw.rectangle([19, 5, 29, 7], fill=tint)
        draw.point((22, 9), fill=tint)
        draw.point((26, 9), fill=tint)
    elif family_name == "prestiges":
        draw.polygon(
            [(18, 6), (21, 10), (24, 5), (27, 10), (30, 6), (29, 13), (19, 13)],
            fill=BRASS_HI,
        )


def badge(family_name: str, threshold: int) -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), TRANSPARENT)
    draw = ImageDraw.Draw(image)
    dark, tint = FAMILY_COLORS[family_name]

    # Chunky plaque shadow, walnut rim, family-tinted enamel, and cream center.
    draw.ellipse([4, 5, 45, 46], fill=(30, 23, 20, 100))
    draw.ellipse([2, 2, 45, 45], fill=CHAR)
    draw.ellipse([4, 4, 43, 43], fill=WALNUT_D)
    draw.ellipse([6, 6, 41, 41], fill=dark)
    draw.ellipse([9, 9, 38, 38], fill=tint)
    draw.ellipse([12, 12, 35, 38], fill=CREAM)
    draw.arc([12, 12, 35, 38], 200, 340, fill=CREAM_D, width=2)
    draw_family_mark(draw, family_name, dark)
    draw_number(image, threshold, WALNUT_D)

    # Two brass rivets keep the plaque diner-like at small display sizes.
    draw.rectangle([7, 23, 9, 25], fill=BRASS)
    draw.rectangle([38, 23, 40, 25], fill=BRASS)
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for achievement_id, (family_name, threshold) in BADGES.items():
        destination = OUT / f"{achievement_id}.png"
        badge(family_name, threshold).save(destination)
        print(f"wrote {destination} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main()
