#!/usr/bin/env python3
"""Build high-definition storybook character frames from generated sprite sheets.

The checked-in transparent master is the reproducible source.  This script only
segments, normalizes, and downsizes it; no model or network call is needed when
rebuilding runtime assets.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "vendor" / "generated" / "storybook-v2" / "player-sheet-master.png"
OUT = ROOT / "vendor" / "generated" / "storybook-v2" / "player-frames"

FRAME_SIZE = (152, 184)
FRAME_PADDING = 8
ALPHA_CROP_THRESHOLD = 16

# The generated source deliberately has wide, empty gutters.  Bounds sit in
# those gutters so plated carry poses are never clipped into adjacent cells.
X_BOUNDS = (0, 350, 620, 904, 1157, 1536)
Y_BOUNDS = (0, 257, 502, 738, 1024)

ROW_FACING = ("down", "left", "right", "up")


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= ALPHA_CROP_THRESHOLD else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise RuntimeError("Generated character cell is empty")
    return bbox


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Missing generated storybook character source: {SOURCE}")

    sheet = Image.open(SOURCE).convert("RGBA")
    if sheet.size != (X_BOUNDS[-1], Y_BOUNDS[-1]):
        raise SystemExit(
            f"Unexpected player sheet size {sheet.size}; expected {(X_BOUNDS[-1], Y_BOUNDS[-1])}"
        )

    cells: list[tuple[str, Image.Image, tuple[int, int, int, int]]] = []
    max_subject_w = 0
    max_subject_h = 0
    for row, facing in enumerate(ROW_FACING):
        for col in range(5):
            cell = sheet.crop(
                (X_BOUNDS[col], Y_BOUNDS[row], X_BOUNDS[col + 1], Y_BOUNDS[row + 1])
            )
            bbox = alpha_bbox(cell)
            subject_w = bbox[2] - bbox[0]
            subject_h = bbox[3] - bbox[1]
            max_subject_w = max(max_subject_w, subject_w)
            max_subject_h = max(max_subject_h, subject_h)
            name = f"player_carry_{facing}" if col == 4 else f"player_{facing}_{col}"
            cells.append((name, cell, bbox))

    scale = min(
        (FRAME_SIZE[0] - FRAME_PADDING * 2) / max_subject_w,
        (FRAME_SIZE[1] - FRAME_PADDING * 2) / max_subject_h,
    )
    OUT.mkdir(parents=True, exist_ok=True)

    for name, cell, bbox in cells:
        subject = cell.crop(bbox)
        target = (
            max(1, round(subject.width * scale)),
            max(1, round(subject.height * scale)),
        )
        subject = subject.resize(target, Image.Resampling.LANCZOS)
        frame = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
        x = (FRAME_SIZE[0] - subject.width) // 2
        y = FRAME_SIZE[1] - FRAME_PADDING - subject.height
        frame.alpha_composite(subject, (x, y))
        frame.save(OUT / f"{name}.png", optimize=True)

    # Runtime fallbacks keep stable historical keys without duplicating source art.
    aliases = {
        "player": "player_down_0",
        "player_walk": "player_down_1",
    }
    for alias, target in aliases.items():
        Image.open(OUT / f"{target}.png").save(OUT / f"{alias}.png", optimize=True)

    print(
        f"Built {len(cells) + len(aliases)} storybook player frames -> {OUT} "
        f"({FRAME_SIZE[0]}x{FRAME_SIZE[1]}, scale={scale:.4f})"
    )


if __name__ == "__main__":
    main()
