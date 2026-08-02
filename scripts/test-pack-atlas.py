#!/usr/bin/env python3
"""Regression test for straight-alpha preservation in the atlas packer."""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


SCRIPT = Path(__file__).with_name("pack-atlas.py")
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("pack_atlas_script", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not import atlas packer: {SCRIPT}")
PACKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKER)


class AtlasAlphaTest(unittest.TestCase):
    def test_packing_preserves_authored_alpha_once(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_path = root / "source.png"
            atlas_path = root / "atlas.png"
            data_path = root / "atlas.json"
            source = Image.new("RGBA", (2, 2))
            source.putdata(
                [
                    (0, 0, 0, 0),
                    (240, 220, 200, 32),
                    (12, 34, 56, 128),
                    (90, 80, 70, 255),
                ]
            )
            source.save(source_path)

            PACKER.pack_atlas(
                [("probe", source_path)],
                atlas_path,
                data_path,
                cell=2,
            )

            packed = Image.open(atlas_path).convert("RGBA")
            self.assertEqual(
                list(packed.getchannel("A").get_flattened_data()),
                [0, 32, 128, 255],
            )
            self.assertEqual(packed.getpixel((1, 0))[:3], (240, 220, 200))
            self.assertEqual(packed.getpixel((0, 1))[:3], (12, 34, 56))


if __name__ == "__main__":
    unittest.main()
