#!/usr/bin/env python3
"""Integrity checks for generated 32×32 ingredient icons."""

from __future__ import annotations

import unittest
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "scripts" / ".asset-build" / "ingredient-icons"
TARGET = 32


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return image.convert("RGBA")


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


if __name__ == "__main__":
    unittest.main()
