#!/usr/bin/env python3
"""Build smooth Storybook v2 achievement badges from the generated 5x5 sheet."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "vendor" / "generated" / "storybook-v2"
SOURCE = SOURCE_DIR / "achievement-badges-sheet-chroma.png"
MASTER = SOURCE_DIR / "achievement-badges-sheet-master.png"
OUT = SOURCE_DIR / "achievement-badges"

TARGET_SIZE = 96
PADDING = 3
ALPHA_CROP_THRESHOLD = 12
KEY = (255, 0, 255)

BADGE_IDS = (
    "recipe-unlocks-1",
    "recipe-unlocks-5",
    "recipe-unlocks-10",
    "recipe-unlocks-25",
    "recipe-unlocks-50",
    "recipe-unlocks-100",
    "recipe-mastery-5-1",
    "recipe-mastery-5-5",
    "recipe-mastery-5-10",
    "recipe-mastery-10-1",
    "recipe-mastery-10-3",
    "recipe-mastery-10-5",
    "decor-1",
    "decor-3",
    "decor-6",
    "tables-3",
    "tables-5",
    "tables-8",
    "days-1",
    "days-7",
    "days-14",
    "days-30",
    "prestiges-1",
    "prestiges-3",
    "prestiges-5",
)


def grid_bounds(length: int, count: int) -> list[int]:
    return [round(index * length / count) for index in range(count + 1)]


def remove_chroma(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    source_data = (
        rgba.get_flattened_data()
        if hasattr(rgba, "get_flattened_data")
        else rgba.getdata()
    )
    key_amount = Image.new("L", rgba.size)
    key_amount.putdata(
        [
            round(
                255
                * max(0.0, min(1.0, (min(red, blue) - green - 20) / 200))
                * max(0.0, min(1.0, (min(red, blue) - 80) / 80))
            )
            for red, green, blue, _alpha in source_data
        ]
    )
    key_pixels = key_amount.load()
    hard_background = key_amount.point(lambda value: 255 if value >= 216 else 0)
    near_background = hard_background.filter(ImageFilter.MaxFilter(15)).load()

    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, source_alpha = pixels[x, y]
            if near_background[x, y] == 0:
                continue
            matte = 1.0 - key_pixels[x, y] / 255.0
            alpha = max(0, min(255, round(source_alpha * matte)))
            if alpha <= 4:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            if matte >= 0.98:
                continue
            recovered: list[int] = []
            for channel, key_channel in zip((red, green, blue), KEY, strict=True):
                value = (channel - (1.0 - matte) * key_channel) / matte
                recovered.append(max(0, min(255, round(value))))
            pixels[x, y] = (*recovered, alpha)
    return rgba


def subject_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= ALPHA_CROP_THRESHOLD else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise RuntimeError("Generated achievement badge cell is empty")
    return bbox


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Missing Storybook v2 badge source: {SOURCE}")
    chroma = Image.open(SOURCE).convert("RGBA")
    if chroma.size != (1536, 1024):
        raise SystemExit(f"Unexpected badge sheet size: {chroma.size}")
    master = remove_chroma(chroma)
    master.save(MASTER, optimize=True)

    OUT.mkdir(parents=True, exist_ok=True)
    x_bounds = grid_bounds(master.width, 5)
    y_bounds = grid_bounds(master.height, 5)
    for index, badge_id in enumerate(BADGE_IDS):
        col = index % 5
        row = index // 5
        cell = master.crop(
            (x_bounds[col], y_bounds[row], x_bounds[col + 1], y_bounds[row + 1])
        )
        subject = cell.crop(subject_bbox(cell))
        scale = min(
            (TARGET_SIZE - PADDING * 2) / subject.width,
            (TARGET_SIZE - PADDING * 2) / subject.height,
        )
        subject = subject.resize(
            (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
            Image.Resampling.LANCZOS,
        )
        badge = Image.new("RGBA", (TARGET_SIZE, TARGET_SIZE), (0, 0, 0, 0))
        badge.alpha_composite(
            subject,
            ((TARGET_SIZE - subject.width) // 2, (TARGET_SIZE - subject.height) // 2),
        )
        badge.save(OUT / f"{badge_id}.png", optimize=True)

    print(f"Built {len(BADGE_IDS)} Storybook v2 achievement badges -> {OUT}")


if __name__ == "__main__":
    main()
