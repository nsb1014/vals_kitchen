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
) + tuple(f"player_carry_{facing}.png" for facing in FACINGS) + tuple(
    f"player_carry_{facing}_{frame}.png"
    for facing in FACINGS
    for frame in (1, 2)
)
NEUTRAL_CARRY_SHA256 = {
    "down": "884623409a406689981949bc063e0b76498ac43cc9e7d9a0ba8502879e6ea485",
    "left": "24aed5c5704a1051541ab7f4b7b133e6265a5bebd38da1cffc252228b27bfba2",
    "right": "e09f40626145dc5abf06410116b13ce8d182aa95705e22ce1636924bc9c724ac",
    "up": "5a6bd67d1fe1fef662d82367aa33729f52254ce1d5426ff738ed397866680c6c",
}
CARRY_BLEND_TOP = 128
CARRY_BLEND_FULL_WALK_Y = 148
CARRY_BLEND_HEIGHT = 3
CARRY_BLEND_CURVE = 0.004


def zero_hidden_rgb(image: Image.Image) -> Image.Image:
    normalized = image.copy()
    normalized.putdata([
        (red, green, blue, alpha) if alpha else (0, 0, 0, 0)
        for red, green, blue, alpha in image.get_flattened_data()
    ])
    return normalized


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


def expected_carry_walk_pixel(
    carry_pixel: tuple[int, int, int, int],
    walk_pixel: tuple[int, int, int, int],
    x: int,
    y: int,
) -> tuple[int, int, int, int]:
    """Independently reproduce the builder's approved seam pixel."""
    center_x = (FRAME_SIZE[0] - 1) / 2
    seam_y = CARRY_BLEND_TOP + ((x - center_x) ** 2) * CARRY_BLEND_CURVE
    walk_mix = max(0.0, min(1.0, (y - seam_y) / CARRY_BLEND_HEIGHT))
    carry_mix = 1.0 - walk_mix
    carry_red, carry_green, carry_blue, carry_alpha = carry_pixel
    walk_red, walk_green, walk_blue, walk_alpha = walk_pixel
    out_alpha = carry_alpha * carry_mix + walk_alpha * walk_mix
    if out_alpha < 120:
        return (0, 0, 0, 0)
    return (
        max(
            0,
            min(
                255,
                round(
                    (
                        carry_red * carry_alpha * carry_mix
                        + walk_red * walk_alpha * walk_mix
                    )
                    / out_alpha
                ),
            ),
        ),
        max(
            0,
            min(
                255,
                round(
                    (
                        carry_green * carry_alpha * carry_mix
                        + walk_green * walk_alpha * walk_mix
                    )
                    / out_alpha
                ),
            ),
        ),
        max(
            0,
            min(
                255,
                round(
                    (
                        carry_blue * carry_alpha * carry_mix
                        + walk_blue * walk_alpha * walk_mix
                    )
                    / out_alpha
                ),
            ),
        ),
        max(0, min(255, round(out_alpha))),
    )


def unproven_matte_pixels(
    image: Image.Image,
    frame_name: str,
) -> list[tuple[int, int]]:
    """Retain every matte finding except an exactly reproducible seam pixel.

    Neutral carry and walk inputs are checked independently under the same
    three-pixel global limit. This exemption is restricted to the compositor's
    20-row transition band and requires the generated RGBA to exactly match
    the corresponding source pixels plus the fixed mask.
    """
    exposed = exposed_neutral_matte_pixels(image)
    stem = frame_name.removesuffix(".png")
    parts = stem.split("_")
    if len(parts) != 4 or parts[:2] != ["player", "carry"] or parts[3] not in {
        "1",
        "2",
    }:
        return exposed

    facing = parts[2]
    frame = int(parts[3])
    carry = load_rgba(PLAYER_FRAMES / f"player_carry_{facing}.png")
    walk = load_rgba(PLAYER_FRAMES / f"player_{facing}_{frame}.png")
    return [
        (x, y)
        for x, y in exposed
        if not (
            CARRY_BLEND_TOP <= y < CARRY_BLEND_FULL_WALK_Y
            and image.getpixel((x, y))
            == expected_carry_walk_pixel(
                carry.getpixel((x, y)),
                walk.getpixel((x, y)),
                x,
                y,
            )
        )
    ]


class ValSourceIntegrityTests(unittest.TestCase):
    def test_exact_project_owner_chef_source(self) -> None:
        digest = hashlib.sha256(CHEF_SOURCE.read_bytes()).hexdigest()
        self.assertEqual(digest, CHEF_SOURCE_SHA256)

    def test_canonical_walk_and_carry_frames_preserve_canvas_and_silhouette(self) -> None:
        self.assertEqual(len(CANONICAL_PLAYER_FRAMES), 24)
        self.assertEqual(len(set(CANONICAL_PLAYER_FRAMES)), 24)
        self.assertEqual(
            {path.name for path in PLAYER_FRAMES.glob("*.png")},
            set(CANONICAL_PLAYER_FRAMES) | {"player.png", "player_walk.png"},
            "player output must contain 24 canonical frames and two aliases only",
        )

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

                matte_pixels = unproven_matte_pixels(image, frame_name)
                self.assertLessEqual(
                    len(matte_pixels),
                    3,
                    f"exposed neutral matte remains at {matte_pixels[:12]}",
                )

    def test_neutral_carry_frames_remain_exact_authored_files(self) -> None:
        for facing, expected_digest in NEUTRAL_CARRY_SHA256.items():
            with self.subTest(facing=facing):
                path = PLAYER_FRAMES / f"player_carry_{facing}.png"
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), expected_digest)

    def test_carry_seam_provenance_does_not_hide_arbitrary_matte(self) -> None:
        frame_name = "player_carry_right_1.png"
        tampered = load_rgba(PLAYER_FRAMES / frame_name)
        injected = {(0, 140), (10, 140), (117, 140), (127, 140)}
        for coordinate in injected:
            tampered.putpixel(coordinate, (220, 220, 220, 255))

        findings = set(unproven_matte_pixels(tampered, frame_name))
        self.assertTrue(
            injected <= findings,
            "arbitrary neutral pixels inside the blend band must remain matte findings",
        )
        self.assertGreater(
            len(findings),
            3,
            "four arbitrary matte pixels must fail the unchanged global limit",
        )

    def test_carry_strides_preserve_upper_pose_and_use_walk_lower_legs(self) -> None:
        for facing in FACINGS:
            neutral = load_rgba(PLAYER_FRAMES / f"player_carry_{facing}.png")
            neutral_upper = zero_hidden_rgb(neutral.crop((0, 0, 128, CARRY_BLEND_TOP)))
            for frame in (1, 2):
                with self.subTest(facing=facing, frame=frame):
                    stride = load_rgba(
                        PLAYER_FRAMES / f"player_carry_{facing}_{frame}.png"
                    )
                    walk = load_rgba(PLAYER_FRAMES / f"player_{facing}_{frame}.png")
                    stride_upper = zero_hidden_rgb(
                        stride.crop((0, 0, 128, CARRY_BLEND_TOP))
                    )
                    self.assertEqual(
                        stride_upper.tobytes(),
                        neutral_upper.tobytes(),
                        "face, hair, hands, plate, and upper pose must remain exact",
                    )
                    self.assertEqual(
                        stride.crop((0, CARRY_BLEND_FULL_WALK_Y, 128, 160)).tobytes(),
                        zero_hidden_rgb(
                            walk.crop((0, CARRY_BLEND_FULL_WALK_Y, 128, 160))
                        ).tobytes(),
                        "pixels below the curved feather must be the walk stride",
                    )
                    for y in range(CARRY_BLEND_TOP, CARRY_BLEND_FULL_WALK_Y):
                        for x in range(FRAME_SIZE[0]):
                            self.assertEqual(
                                stride.getpixel((x, y)),
                                expected_carry_walk_pixel(
                                    neutral.getpixel((x, y)),
                                    walk.getpixel((x, y)),
                                    x,
                                    y,
                                ),
                                f"unproven carry seam pixel at ({x}, {y})",
                            )
                    self.assertNotEqual(
                        stride.tobytes(),
                        neutral.tobytes(),
                        "stride frame must animate the lower body",
                    )
                    hidden_rgb = [
                        (red, green, blue)
                        for red, green, blue, alpha in stride.get_flattened_data()
                        if alpha == 0 and (red or green or blue)
                    ]
                    self.assertEqual(hidden_rgb, [], "transparent pixels must have zero RGB")

                    stride_bounds = stride.getchannel("A").getbbox()
                    walk_bounds = walk.getchannel("A").getbbox()
                    neutral_bounds = neutral.getchannel("A").getbbox()
                    assert stride_bounds is not None
                    assert walk_bounds is not None
                    assert neutral_bounds is not None
                    self.assertEqual(
                        stride_bounds[3],
                        walk_bounds[3],
                        "carry stride must keep the walk frame's feet baseline",
                    )
                    self.assertLessEqual(
                        abs(stride_bounds[3] - neutral_bounds[3]),
                        1,
                        "carry cycle feet baseline must remain stable",
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
        self.assertEqual(len(self.manifest), 108)

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
