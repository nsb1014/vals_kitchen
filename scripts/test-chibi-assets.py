#!/usr/bin/env python3
"""Pre-build integrity checks for committed character source assets and atlas."""

from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
CHIBI_ROOT = ROOT / "vendor" / "generated" / "chibi-ui"
PLAYER_FRAMES = CHIBI_ROOT / "player-frames"
CHEF_SOURCE = CHIBI_ROOT / "source" / "chef-sheet.png"
MANIFEST_PATH = ROOT / "scripts" / ".asset-build" / "characters.manifest.json"
ATLAS_JSON_PATH = ROOT / "public" / "assets" / "atlases" / "characters.json"
ATLAS_IMAGE_PATH = ROOT / "public" / "assets" / "atlases" / "characters.png"

CHEF_SOURCE_SHA256 = "80d39c529aad6e5d9789f77688cc78cfea5429555ab7320d267a4c60daaa541a"
FRAME_SIZE = (128, 160)
FACINGS = ("left", "down", "up", "right")
CANONICAL_PLAYER_FRAMES = tuple(
    f"player_{facing}_{frame}.png"
    for facing in FACINGS
    for frame in range(3)
) + tuple(f"player_carry_{facing}.png" for facing in FACINGS)


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return image.convert("RGBA")


def is_neutral_matte(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 0 and min(red, green, blue) > 160 and max(red, green, blue) - min(
        red, green, blue
    ) < 45


def exposed_neutral_matte_pixels(image: Image.Image) -> list[tuple[int, int]]:
    """Find pale neutral pixels on an alpha silhouette's exposed edge.

    Only pixels causally connected to transparency through one of their eight
    neighbours count. This avoids flagging Val's intentional light clothing or
    eye highlights in the interior of the sprite.
    """

    pixels = image.load()
    exposed: list[tuple[int, int]] = []
    for y in range(image.height):
        for x in range(image.width):
            if not is_neutral_matte(pixels[x, y]):
                continue
            touches_transparency = False
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    neighbour_x = x + dx
                    neighbour_y = y + dy
                    if not (0 <= neighbour_x < image.width and 0 <= neighbour_y < image.height):
                        touches_transparency = True
                        break
                    if pixels[neighbour_x, neighbour_y][3] == 0:
                        touches_transparency = True
                        break
                if touches_transparency:
                    break
            if touches_transparency:
                exposed.append((x, y))
    return exposed


class ValSourceIntegrityTests(unittest.TestCase):
    def test_exact_project_owner_chef_source(self) -> None:
        digest = hashlib.sha256(CHEF_SOURCE.read_bytes()).hexdigest()
        self.assertEqual(digest, CHEF_SOURCE_SHA256)

    def test_canonical_walk_and_carry_frames_preserve_canvas_and_silhouette(self) -> None:
        self.assertEqual(len(CANONICAL_PLAYER_FRAMES), 16)
        self.assertEqual(len(set(CANONICAL_PLAYER_FRAMES)), 16)

        for frame_name in CANONICAL_PLAYER_FRAMES:
            with self.subTest(frame=frame_name):
                image = load_rgba(PLAYER_FRAMES / frame_name)
                self.assertEqual(image.size, FRAME_SIZE)

                bounds = image.getchannel("A").getbbox()
                self.assertIsNotNone(bounds, "frame must contain a visible sprite")
                assert bounds is not None
                left, top, right, bottom = bounds
                margins = {
                    "left": left,
                    "top": top,
                    "right": image.width - right,
                    "bottom": image.height - bottom,
                }
                for side, margin in margins.items():
                    self.assertGreaterEqual(
                        margin,
                        4,
                        f"{side} alpha margin is too small: {margin}px",
                    )
                self.assertLessEqual(
                    margins["bottom"],
                    8,
                    f"feet baseline drifted upward: {margins['bottom']}px bottom gap",
                )
                self.assertGreaterEqual(
                    bottom - top,
                    138,
                    f"visible sprite is too short: {bottom - top}px",
                )

                matte_pixels = exposed_neutral_matte_pixels(image)
                self.assertLessEqual(
                    len(matte_pixels),
                    3,
                    f"exposed neutral matte remains at {matte_pixels[:12]}",
                )

    def test_legacy_player_aliases_are_pixel_exact(self) -> None:
        aliases = {
            "player.png": "player_down_0.png",
            "player_walk.png": "player_down_1.png",
        }
        for alias_name, canonical_name in aliases.items():
            with self.subTest(alias=alias_name):
                alias = load_rgba(PLAYER_FRAMES / alias_name)
                canonical = load_rgba(PLAYER_FRAMES / canonical_name)
                self.assertEqual(alias.size, canonical.size)
                self.assertEqual(alias.tobytes(), canonical.tobytes())


class CharacterAtlasIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        cls.atlas_data = json.loads(ATLAS_JSON_PATH.read_text(encoding="utf-8"))
        cls.atlas = load_rgba(ATLAS_IMAGE_PATH)

    def test_all_manifest_sources_are_present_and_frame_metadata_is_canonical(self) -> None:
        self.assertIsInstance(self.manifest, dict)
        self.assertEqual(len(self.manifest), 100)

        frames = self.atlas_data["frames"]
        self.assertEqual(set(frames), set(self.manifest))
        self.assertEqual(self.atlas_data["meta"]["size"], {
            "w": self.atlas.width,
            "h": self.atlas.height,
        })

        for name, relative_source in self.manifest.items():
            with self.subTest(frame=name):
                source_path = (MANIFEST_PATH.parent / relative_source).resolve()
                self.assertTrue(source_path.is_file(), f"missing manifest source: {source_path}")
                source = load_rgba(source_path)
                self.assertEqual(source.size, FRAME_SIZE)

                metadata = frames[name]
                self.assertFalse(metadata["rotated"])
                self.assertFalse(metadata["trimmed"])
                self.assertEqual(metadata["frame"]["w"], FRAME_SIZE[0])
                self.assertEqual(metadata["frame"]["h"], FRAME_SIZE[1])
                self.assertEqual(metadata["sourceSize"], {"w": 128, "h": 160})
                self.assertEqual(
                    metadata["spriteSourceSize"],
                    {"x": 0, "y": 0, "w": 128, "h": 160},
                )
                alpha_bounds = source.getchannel("A").getbbox()
                self.assertIsNotNone(alpha_bounds, f"empty character frame: {name}")
                left, top, right, bottom = alpha_bounds
                self.assertEqual(
                    metadata["contentBounds"],
                    {
                        "x": left,
                        "y": top,
                        "w": right - left,
                        "h": bottom - top,
                    },
                )

    def test_atlas_pixels_preserve_every_manifest_source(self) -> None:
        frames = self.atlas_data["frames"]
        for name, relative_source in self.manifest.items():
            with self.subTest(frame=name):
                source_path = (MANIFEST_PATH.parent / relative_source).resolve()
                source = load_rgba(source_path)
                frame = frames[name]["frame"]
                packed = self.atlas.crop(
                    (
                        frame["x"],
                        frame["y"],
                        frame["x"] + frame["w"],
                        frame["y"] + frame["h"],
                    )
                )
                self.assertEqual(packed.size, FRAME_SIZE)
                self.assertEqual(
                    packed.getchannel("A").tobytes(),
                    source.getchannel("A").tobytes(),
                    "atlas packing changed source alpha",
                )

                source_pixels = source.load()
                packed_pixels = packed.load()
                for y in range(source.height):
                    for x in range(source.width):
                        source_pixel = source_pixels[x, y]
                        if source_pixel[3] == 0:
                            continue
                        self.assertEqual(
                            packed_pixels[x, y][:3],
                            source_pixel[:3],
                            f"atlas RGB differs at visible source pixel ({x}, {y})",
                        )


if __name__ == "__main__":
    unittest.main()
