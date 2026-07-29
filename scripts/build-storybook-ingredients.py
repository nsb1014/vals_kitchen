#!/usr/bin/env python3
"""Build smooth Storybook v2 ingredient icons from generated chroma sheets.

The checked-in chroma sources are the reproducible masters.  This script removes
the flat magenta key without treating naturally pink food as background, writes
transparent sheet masters, and derives normalized 128px inventory icons.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "vendor" / "generated" / "storybook-v2" / "ingredient-sheets"
OUT = ROOT / "vendor" / "generated" / "storybook-v2" / "ingredient-icons"

TARGET_SIZE = 128
PADDING = 6
KEY = (255, 0, 255)
ALPHA_CROP_THRESHOLD = 12

SHEETS: tuple[tuple[str, int, int, tuple[str, ...]], ...] = (
    (
        "sheet-01-alliums-roots",
        4,
        3,
        ("onion", "garlic", "ginger", "carrot", "potato", "sweet_potato", "celery", "bell_pepper", "zucchini", "corn", "eggplant", "portobello_mushroom"),
    ),
    (
        "sheet-02-greens-produce",
        4,
        3,
        ("lettuce", "cucumber", "tomato", "tomato_paste", "broccoli", "bok_choy", "thai_basil", "bay_leaf", "avocado", "lemon", "dill_pickle", "kimchi"),
    ),
    (
        "sheet-03-proteins-meat",
        4,
        3,
        ("chicken", "chicken_thigh", "chicken_wing", "beef_steak", "pork_chop", "lamb_chop", "brisket", "pork_ribs", "bacon", "turkey", "sausage", "salmon_fillet"),
    ),
    (
        "sheet-04-seafood-legumes",
        4,
        3,
        ("smoked_salmon", "shrimp", "calamari", "tempura_shrimp", "tofu", "smoked_tofu", "tempeh", "falafel", "jackfruit", "lentils", "chickpeas", "white_beans"),
    ),
    (
        "sheet-05-grains-starches",
        4,
        3,
        ("flour", "rice", "bread", "pasta", "rice_noodle", "phyllo", "potato_fries", "plantain", "oat_milk", "yeast_doughnut", "egg", "almond"),
    ),
    (
        "sheet-06-dairy-sweeteners",
        4,
        3,
        ("butter", "cheddar", "mozzarella", "yogurt", "cream", "feta", "cream_cheese", "sour_cream", "coconut_milk", "sugar", "honey", "maple_syrup"),
    ),
    (
        "sheet-07-spices-herbs",
        4,
        3,
        ("salt", "black_pepper", "cinnamon", "cardamom", "cumin", "coriander", "turmeric", "paprika", "smoked_paprika", "chili_flake", "oregano", "thyme"),
    ),
    (
        "sheet-08-pantry-fermented",
        4,
        3,
        ("rosemary", "vanilla", "cocoa", "yeast", "olive_oil", "sesame_oil", "soy_sauce", "shrimp_paste", "fish_sauce", "miso", "sauerkraut", "kombucha"),
    ),
    (
        "sheet-09-beverages-broths",
        2,
        2,
        ("coffee", "black_tea", "vegetable_broth", "beef_broth"),
    ),
)


def grid_bounds(length: int, count: int) -> list[int]:
    return [round(index * length / count) for index in range(count + 1)]


def remove_chroma(image: Image.Image) -> Image.Image:
    """Recover the local edge matte without classifying naturally pink food as key."""
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

    # Only apply the chroma formula in a narrow band connected to confidently
    # magenta background. This leaves naturally pink meat and pale dairy opaque.
    hard_background = key_amount.point(lambda value: 255 if value >= 216 else 0)
    near_background = hard_background.filter(ImageFilter.MaxFilter(15)).load()

    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, source_alpha = pixels[x, y]
            if near_background[x, y] == 0:
                pixels[x, y] = (red, green, blue, source_alpha)
                continue

            matte = 1.0 - key_pixels[x, y] / 255.0
            alpha = max(0, min(255, round(255 * matte * source_alpha / 255)))
            if alpha <= 4:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            if matte >= 0.98:
                pixels[x, y] = (red, green, blue, source_alpha)
                continue

            # Reverse the chroma composite at soft edges to prevent pink halos.
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
        raise RuntimeError("Generated ingredient cell is empty")
    return bbox


def render_icon(cell: Image.Image) -> Image.Image:
    subject = cell.crop(subject_bbox(cell))
    scale = min(
        (TARGET_SIZE - PADDING * 2) / subject.width,
        (TARGET_SIZE - PADDING * 2) / subject.height,
    )
    subject = subject.resize(
        (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
        Image.Resampling.LANCZOS,
    )
    icon = Image.new("RGBA", (TARGET_SIZE, TARGET_SIZE), (0, 0, 0, 0))
    icon.alpha_composite(
        subject,
        ((TARGET_SIZE - subject.width) // 2, (TARGET_SIZE - subject.height) // 2),
    )
    return icon


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, str] = {}
    count = 0

    for stem, cols, rows, items in SHEETS:
        source = SOURCE_DIR / f"{stem}-chroma.png"
        if not source.is_file():
            raise SystemExit(f"Missing Storybook v2 ingredient source: {source}")
        chroma = Image.open(source).convert("RGBA")
        if chroma.size != (1536, 1024):
            raise SystemExit(f"Unexpected ingredient sheet size for {source}: {chroma.size}")
        master = remove_chroma(chroma)
        master.save(SOURCE_DIR / f"{stem}-master.png", optimize=True)

        x_bounds = grid_bounds(master.width, cols)
        y_bounds = grid_bounds(master.height, rows)
        if len(items) > cols * rows:
            raise RuntimeError(f"Too many items in {stem}")
        for index, item_id in enumerate(items):
            col = index % cols
            row = index // cols
            cell = master.crop(
                (x_bounds[col], y_bounds[row], x_bounds[col + 1], y_bounds[row + 1])
            )
            destination = OUT / f"{item_id}.png"
            render_icon(cell).save(destination, optimize=True)
            manifest[f"icon_{item_id}"] = str(destination)
            count += 1

    if count != 100:
        raise RuntimeError(f"Expected 100 Storybook v2 ingredient icons, built {count}")
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Built {count} Storybook v2 ingredient icons -> {OUT} ({TARGET_SIZE}x{TARGET_SIZE})")


if __name__ == "__main__":
    main()
