#!/usr/bin/env python3
"""Generate project-CC0 seated character frames from Kenney RPG Urban idle sprites.

Walk cycles stay Kenney CC0. Sit poses are project-derived transforms of those
idle frames (torso lowered, legs folded) and are dedicated to CC0 by this project.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor" / "kenney" / "sources" / "rpg-urban-pack" / "Tiles"
OUT = ROOT / "vendor" / "generated" / "character-sit"

# Idle frame 0 for each facing × variant (matches build-assets CHARACTER_SPRITES).
SOURCES: dict[str, str] = {
    "guest_a_sit_left": "tile_0023.png",
    "guest_a_sit_down": "tile_0024.png",
    "guest_a_sit_up": "tile_0025.png",
    "guest_a_sit_right": "tile_0026.png",
    "guest_b_sit_left": "tile_0104.png",
    "guest_b_sit_down": "tile_0105.png",
    "guest_b_sit_up": "tile_0106.png",
    "guest_b_sit_right": "tile_0107.png",
}


def _opaque(px: tuple[int, int, int, int]) -> bool:
    return px[3] > 0


def make_sit(src: Image.Image, facing: str) -> Image.Image:
    """Fold standing idle into a readable seated pose (still 16×16)."""
    src = src.convert("RGBA")
    w, h = src.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    # Upper body band (hair → mid torso). Shift down so the figure sits lower.
    upper_top, upper_bot = 2, 11
    shift = 3
    for y in range(upper_top, upper_bot):
        dest_y = y + shift
        if dest_y >= h:
            continue
        for x in range(w):
            px = src.getpixel((x, y))
            if _opaque(px):
                out.putpixel((x, dest_y), px)

    # Sample pants / shoe colors from standing legs for the folded seat.
    pant = None
    shoe = None
    for y in range(11, 14):
        for x in range(w):
            px = src.getpixel((x, y))
            if _opaque(px) and pant is None:
                pant = px
    for y in range(14, 16):
        for x in range(w):
            px = src.getpixel((x, y))
            if _opaque(px) and shoe is None:
                shoe = px
    if pant is None:
        pant = (168, 140, 96, 255)
    if shoe is None:
        shoe = (72, 56, 40, 255)

    # Seated lower body: short block under torso + feet tucked toward facing.
    seat_y0, seat_y1 = 13, 15
    if facing in ("left", "right"):
        # Side sit: hips centered, legs extend slightly toward facing.
        hip_xs = range(5, 11)
        foot_xs = range(3, 8) if facing == "left" else range(8, 13)
        for y in range(seat_y0, seat_y1):
            for x in hip_xs:
                out.putpixel((x, y), pant)
        for x in foot_xs:
            out.putpixel((x, 15), shoe)
            if 0 <= x + (1 if facing == "right" else -1) < w:
                out.putpixel((x, 14), pant)
    elif facing == "up":
        # Back sit: compact rear silhouette, no face detail needed.
        for y in range(seat_y0, seat_y1):
            for x in range(5, 11):
                out.putpixel((x, y), pant)
        for x in range(5, 11):
            out.putpixel((x, 15), shoe)
    else:
        # Front sit: knees forward, feet as two short stubs.
        for y in range(seat_y0, seat_y1):
            for x in range(4, 12):
                out.putpixel((x, y), pant)
        out.putpixel((5, 15), shoe)
        out.putpixel((6, 15), shoe)
        out.putpixel((9, 15), shoe)
        out.putpixel((10, 15), shoe)

    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, file in SOURCES.items():
        facing = name.rsplit("_", 1)[-1]
        src_path = VENDOR / file
        if not src_path.exists():
            raise SystemExit(f"Missing source sprite: {src_path}")
        sit = make_sit(Image.open(src_path), facing)
        out_path = OUT / f"{name}.png"
        sit.save(out_path)
        print(f"Wrote {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
