#!/usr/bin/env python3
"""Build high-definition Storybook v2 guest walk and seated frames."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "vendor" / "generated" / "storybook-v2"
OUT = SOURCE_DIR / "guest-frames"

SOURCES = {
    "idle": SOURCE_DIR / "guest-idle-sheet-master.png",
    "walk": SOURCE_DIR / "guest-walk-sheet-master.png",
    "sit": SOURCE_DIR / "guest-sit-sheet-master.png",
}

FRAME_SIZE = (152, 184)
FRAME_PADDING = 8
ALPHA_CROP_THRESHOLD = 16
VARIANTS = ("a", "b", "c", "d", "e")
ROW_FACING = ("down", "left", "right", "up")


def grid_bounds(length: int, count: int) -> list[int]:
    return [round(index * length / count) for index in range(count + 1)]


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    """Return the largest connected silhouette, ignoring neighboring-row fragments."""
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
        raise RuntimeError("Generated guest cell is empty")
    return largest[1]


def main() -> None:
    sheets: dict[str, Image.Image] = {}
    for pose, source in SOURCES.items():
        if not source.is_file():
            raise SystemExit(f"Missing generated Storybook v2 guest source: {source}")
        sheet = Image.open(source).convert("RGBA")
        if sheet.size != (1536, 1024):
            raise SystemExit(f"Unexpected {pose} guest sheet size: {sheet.size}")
        sheets[pose] = sheet

    cells: dict[tuple[str, str, str], tuple[Image.Image, tuple[int, int, int, int]]] = {}
    max_subject_w = 0
    max_subject_h = 0
    for pose, sheet in sheets.items():
        x_bounds = grid_bounds(sheet.width, len(VARIANTS))
        y_bounds = grid_bounds(sheet.height, len(ROW_FACING))
        for row, facing in enumerate(ROW_FACING):
            for col, variant in enumerate(VARIANTS):
                cell = sheet.crop(
                    (
                        x_bounds[col],
                        y_bounds[row],
                        x_bounds[col + 1],
                        y_bounds[row + 1],
                    )
                )
                bbox = alpha_bbox(cell)
                max_subject_w = max(max_subject_w, bbox[2] - bbox[0])
                max_subject_h = max(max_subject_h, bbox[3] - bbox[1])
                cells[(pose, variant, facing)] = (cell, bbox)

    scale = min(
        (FRAME_SIZE[0] - FRAME_PADDING * 2) / max_subject_w,
        (FRAME_SIZE[1] - FRAME_PADDING * 2) / max_subject_h,
    )
    OUT.mkdir(parents=True, exist_ok=True)

    def render(pose: str, variant: str, facing: str, out_name: str) -> None:
        cell, bbox = cells[(pose, variant, facing)]
        subject = cell.crop(bbox)
        subject = subject.resize(
            (
                max(1, round(subject.width * scale)),
                max(1, round(subject.height * scale)),
            ),
            Image.Resampling.LANCZOS,
        )
        frame = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
        frame.alpha_composite(
            subject,
            (
                (FRAME_SIZE[0] - subject.width) // 2,
                FRAME_SIZE[1] - FRAME_PADDING - subject.height,
            ),
        )
        frame.save(OUT / out_name, optimize=True)

    for variant in VARIANTS:
        for facing in ROW_FACING:
            # The three-frame runtime cycle is idle -> authored step -> idle.
            render("idle", variant, facing, f"guest_{variant}_{facing}_0.png")
            render("walk", variant, facing, f"guest_{variant}_{facing}_1.png")
            render("idle", variant, facing, f"guest_{variant}_{facing}_2.png")
            render("sit", variant, facing, f"guest_{variant}_sit_{facing}.png")

    aliases = {
        "customer.png": "guest_a_down_0.png",
        "customer_b.png": "guest_b_down_0.png",
    }
    for alias, target in aliases.items():
        Image.open(OUT / target).save(OUT / alias, optimize=True)

    print(
        f"Built {len(VARIANTS) * len(ROW_FACING) * 4 + len(aliases)} "
        f"storybook guest frames -> {OUT} "
        f"({FRAME_SIZE[0]}x{FRAME_SIZE[1]}, scale={scale:.4f})"
    )


if __name__ == "__main__":
    main()
