#!/usr/bin/env python3
"""Integrity checks for generated 32×32 ingredient icons."""

from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "scripts" / ".asset-build" / "ingredient-icons"
SHEETS_DIR = ROOT / "vendor" / "generated" / "ingredient-sheets"
TARGET = 32
PALE_FOODS = (
    "garlic.png",
    "rice.png",
    "flour.png",
    "salt.png",
    "butter.png",
    "mozzarella.png",
    "sugar.png",
)


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return image.convert("RGBA")


def load_builder():
    spec = importlib.util.spec_from_file_location(
        "build_ingredient_icons",
        Path(__file__).resolve().parent / "build-ingredient-icons.py",
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def is_near_white(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return (
        alpha > 0
        and min(red, green, blue) >= 200
        and max(red, green, blue) - min(red, green, blue) < 40
    )


def isolated_white_fringe(image: Image.Image) -> list[tuple[int, int]]:
    pixels = image.load()
    hits: list[tuple[int, int]] = []
    for y in range(image.height):
        for x in range(image.width):
            if not is_near_white(pixels[x, y]):
                continue
            opaque_neighbors = 0
            touches_clear = False
            for nx in range(max(0, x - 1), min(image.width, x + 2)):
                for ny in range(max(0, y - 1), min(image.height, y + 2)):
                    if nx == x and ny == y:
                        continue
                    if pixels[nx, ny][3] == 0:
                        touches_clear = True
                    else:
                        opaque_neighbors += 1
            if x in (0, image.width - 1) or y in (0, image.height - 1):
                touches_clear = True
            if touches_clear and opaque_neighbors <= 3:
                hits.append((x, y))
    return hits


def interior_pale_pixels(image: Image.Image) -> int:
    """Count pale opaque pixels whose 4-neighbors are also opaque."""
    pixels = image.load()
    count = 0
    for y in range(1, image.height - 1):
        for x in range(1, image.width - 1):
            if not is_near_white(pixels[x, y]):
                continue
            if all(
                pixels[x + dx, y + dy][3] > 0
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1))
            ):
                count += 1
    return count


def interior_holes(image: Image.Image) -> int:
    """Count transparent pixels enclosed by food, not silhouette notches."""
    pixels = image.load()
    width, height = image.size
    exterior = [[False] * width for _ in range(height)]
    queue = []

    def consider(x: int, y: int) -> None:
        if exterior[y][x]:
            return
        if pixels[x, y][3] >= 16:
            return
        exterior[y][x] = True
        queue.append((x, y))

    for x in range(width):
        consider(x, 0)
        consider(x, height - 1)
    for y in range(height):
        consider(0, y)
        consider(width - 1, y)
    while queue:
        x, y = queue.pop()
        for nx in range(max(0, x - 1), min(width, x + 2)):
            for ny in range(max(0, y - 1), min(height, y + 2)):
                consider(nx, ny)

    holes = 0
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            if exterior[y][x] or pixels[x, y][3] != 0:
                continue
            neighbors = sum(
                1
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1))
                if pixels[x + dx, y + dy][3] > 0
            )
            if neighbors >= 3:
                holes += 1
    return holes


class IngredientIconIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.icons = sorted(ICON_DIR.glob("*.png"))
        if not cls.icons:
            raise unittest.SkipTest(f"No generated icons in {ICON_DIR}")

    def test_icons_are_32_square_with_transparent_padding(self) -> None:
        self.assertGreaterEqual(len(self.icons), 100)
        for path in self.icons:
            with self.subTest(icon=path.name):
                image = load_rgba(path)
                self.assertEqual(image.size, (TARGET, TARGET))
                bounds = image.getchannel("A").getbbox()
                self.assertIsNotNone(bounds, f"empty icon: {path.name}")
                left, top, right, bottom = bounds
                self.assertGreaterEqual(left, 1, f"{path.name} clipped on left")
                self.assertGreaterEqual(top, 1, f"{path.name} clipped on top")
                self.assertLessEqual(right, TARGET - 1, f"{path.name} clipped on right")
                self.assertLessEqual(bottom, TARGET - 1, f"{path.name} clipped on bottom")

    def test_pale_foods_do_not_keep_a_white_matte_fringe(self) -> None:
        for name in ("chicken.png", "butter.png", "garlic.png", "egg.png", "rice.png", "flour.png"):
            with self.subTest(icon=name):
                image = load_rgba(ICON_DIR / name)
                fringe = isolated_white_fringe(image)
                self.assertLessEqual(
                    len(fringe),
                    8,
                    f"{name} still has isolated white fringe at {fringe[:12]}",
                )

    def test_pale_foods_keep_enclosed_white_interiors(self) -> None:
        minima = {
            "garlic.png": 30,
            "rice.png": 20,
            "flour.png": 12,
            "salt.png": 12,
            "butter.png": 8,
            "mozzarella.png": 30,
            "sugar.png": 20,
        }
        for name in PALE_FOODS:
            with self.subTest(icon=name):
                image = load_rgba(ICON_DIR / name)
                pale = interior_pale_pixels(image)
                holes = interior_holes(image)
                self.assertGreaterEqual(
                    pale,
                    minima[name],
                    f"{name} lost its pale interior ({pale} enclosed pale px)",
                )
                self.assertLessEqual(
                    holes,
                    4,
                    f"{name} still has punched interior holes ({holes})",
                )

    def test_source_sheets_use_magenta_matte(self) -> None:
        manifest = json.loads((SHEETS_DIR / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest.get("matte"), "magenta")
        for spec in manifest["sheets"]:
            path = SHEETS_DIR / spec["file"]
            with self.subTest(sheet=spec["file"]):
                image = load_rgba(path)
                for x, y in (
                    (0, 0),
                    (image.width - 1, 0),
                    (0, image.height - 1),
                    (image.width - 1, image.height - 1),
                ):
                    red, green, blue, alpha = image.getpixel((x, y))
                    self.assertTrue(
                        alpha >= 16 and red >= 240 and green <= 40 and blue >= 240,
                        f"{spec['file']} corner {(x, y)} is not magenta: "
                        f"{(red, green, blue, alpha)}",
                    )


class IngredientExtractTests(unittest.TestCase):
    def test_extract_keeps_enclosed_white_on_magenta(self) -> None:
        builder = load_builder()
        sheet = Image.new("RGBA", (48, 48), (255, 0, 255, 255))
        pixels = sheet.load()
        for y in range(12, 36):
            for x in range(12, 36):
                if x in (12, 35) or y in (12, 35):
                    pixels[x, y] = (24, 20, 18, 255)
                else:
                    pixels[x, y] = (253, 253, 253, 255)
        extracted = builder.extract_connected_item(sheet, (0, 0, 48, 48), overflow=0)
        pale = interior_pale_pixels(extracted)
        self.assertGreaterEqual(pale, 200, f"enclosed white was keyed out ({pale} px)")
        for y in range(extracted.height):
            for x in range(extracted.width):
                red, green, blue, alpha = extracted.getpixel((x, y))
                if alpha == 0:
                    continue
                self.assertFalse(
                    red >= 240 and green <= 40 and blue >= 240,
                    f"magenta residual at {(x, y)}",
                )


if __name__ == "__main__":
    unittest.main()
