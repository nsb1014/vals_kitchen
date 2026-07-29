#!/usr/bin/env python3
"""Build high-definition Storybook v2 restaurant props from the generated sheet."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "vendor" / "generated" / "storybook-v2" / "furniture-sheet-master.png"
OUT = ROOT / "vendor" / "generated" / "storybook-v2" / "restaurant-props"

ALPHA_CROP_THRESHOLD = 16
PADDING = 8

ROWS: tuple[tuple[tuple[int, ...], tuple[str, ...]], ...] = (
    (
        (0, 304, 540, 764, 1009, 1221, 1536),
        ("prep_station", "grill", "oven", "fryer", "stockpot", "cold_station"),
    ),
    (
        (0, 306, 541, 766, 986, 1239, 1536),
        ("pastry_bench", "smoker", "wok", "fermentation_crock", "barista_station", "spice_rack"),
    ),
    (
        (0, 294, 535, 783, 953, 1131, 1300, 1536),
        (
            "table_2seat",
            "table_2seat_unset",
            "table_2seat_dirty",
            "chair",
            "chair_back",
            "chair_side",
            "decor_plant",
        ),
    ),
    (
        (0, 230, 585, 749, 994, 1222, 1536),
        ("decor_flowers", "decor_rug", "decor_lamp", "decor_sign", "door", "door_open"),
    ),
)
Y_BOUNDS = (0, 270, 520, 760, 1024)

TABLES = {"table_2seat", "table_2seat_unset", "table_2seat_dirty", "decor_rug"}
TALL_NARROW = {
    "chair",
    "chair_back",
    "chair_side",
    "decor_plant",
    "decor_flowers",
    "decor_lamp",
    "decor_sign",
    "door",
    "door_open",
}


def largest_component_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    width, height = image.size
    alpha_data = (
        alpha.get_flattened_data()
        if hasattr(alpha, "get_flattened_data")
        else alpha.getdata()
    )
    foreground = bytearray(
        1 if value >= ALPHA_CROP_THRESHOLD else 0 for value in alpha_data
    )
    largest: tuple[int, tuple[int, int, int, int]] | None = None

    for start, present in enumerate(foreground):
        if not present:
            continue
        stack = [start]
        foreground[start] = 0
        count = 0
        min_x = width
        min_y = height
        max_x = 0
        max_y = 0
        while stack:
            index = stack.pop()
            y, x = divmod(index, width)
            count += 1
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
            for neighbor in (index - 1, index + 1, index - width, index + width):
                if neighbor < 0 or neighbor >= width * height or not foreground[neighbor]:
                    continue
                neighbor_y, neighbor_x = divmod(neighbor, width)
                if abs(neighbor_x - x) + abs(neighbor_y - y) != 1:
                    continue
                foreground[neighbor] = 0
                stack.append(neighbor)
        candidate = (count, (min_x, min_y, max_x + 1, max_y + 1))
        if largest is None or candidate[0] > largest[0]:
            largest = candidate

    if largest is None:
        raise RuntimeError("Generated prop cell is empty")
    left, top, right, bottom = largest[1]
    return (
        max(0, left - 2),
        max(0, top - 2),
        min(width, right + 2),
        min(height, bottom + 2),
    )


def frame_size(name: str) -> tuple[int, int]:
    if name in TABLES:
        return (192, 144)
    if name in TALL_NARROW:
        return (128, 192)
    return (160, 192)


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Missing generated Storybook v2 furniture source: {SOURCE}")
    sheet = Image.open(SOURCE).convert("RGBA")
    if sheet.size != (1536, 1024):
        raise SystemExit(f"Unexpected furniture sheet size: {sheet.size}")
    OUT.mkdir(parents=True, exist_ok=True)

    count = 0
    for row, (x_bounds, names) in enumerate(ROWS):
        if len(x_bounds) != len(names) + 1:
            raise RuntimeError(f"Invalid prop row {row} bounds")
        for col, name in enumerate(names):
            cell = sheet.crop(
                (x_bounds[col], Y_BOUNDS[row], x_bounds[col + 1], Y_BOUNDS[row + 1])
            )
            subject = cell.crop(largest_component_bbox(cell))
            target_w, target_h = frame_size(name)
            scale = min(
                (target_w - PADDING * 2) / subject.width,
                (target_h - PADDING * 2) / subject.height,
            )
            subject = subject.resize(
                (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
                Image.Resampling.LANCZOS,
            )
            frame = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
            frame.alpha_composite(
                subject,
                ((target_w - subject.width) // 2, target_h - PADDING - subject.height),
            )
            frame.save(OUT / f"{name}.png", optimize=True)
            count += 1

    print(f"Built {count} Storybook v2 restaurant props -> {OUT}")


if __name__ == "__main__":
    main()
