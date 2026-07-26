#!/usr/bin/env python3
"""Generate project-CC0 cozy diner restaurant tiles (readable 32px pixel art).

Floors / walls / door: 32×32
Furniture / stations / decor: 32×48 (tall for Y-sort; mass in lower portion)

Designed to read as warm oak planks + cream kitchen tile at game scale —
not thick stripe/grout programmer placeholders.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "vendor" / "generated" / "restaurant-tiles"

TILE = 32
FURN_W = 32
FURN_H = 48

# Warm honey oak — seams stay close to plank so tiled floors don't stripe
OAK = [
    (186, 142, 92),
    (178, 134, 84),
    (194, 150, 100),
    (170, 128, 78),
    (162, 120, 70),
    (190, 146, 96),
]
OAK_SEAM = (148, 108, 62)
OAK_GRAIN = (204, 162, 112)
OAK_KNOT = (132, 96, 54)

# Cream kitchen ceramic (warm, not teal void)
TILE_A = (232, 220, 198)
TILE_B = (218, 204, 178)
TILE_GROUT = (176, 160, 136)
TILE_HI = (244, 236, 220)
TILE_LO = (200, 184, 158)

CREAM = (240, 232, 214)
CREAM_D = (222, 210, 188)
PAPER = (236, 226, 206)
PAPER_D = (214, 200, 176)
SAGE = (156, 176, 142)
SAGE_D = (128, 148, 116)
SAGE_HI = (178, 196, 164)
WAINSCOT = (188, 168, 132)
WAINSCOT_D = (158, 138, 104)

WALNUT = (118, 76, 44)
WALNUT_D = (88, 54, 30)
WALNUT_HI = (148, 100, 60)
STEEL = (176, 184, 194)
STEEL_HI = (220, 226, 234)
STEEL_D = (128, 136, 146)
STEEL_DK = (86, 92, 102)
COPPER = (204, 124, 68)
COPPER_D = (168, 92, 48)
COPPER_HI = (232, 160, 100)
BRASS = (208, 172, 76)
CHAR = (52, 46, 42)
SMOKE = (102, 96, 90)
MARBLE = (240, 236, 232)
MARBLE_V = (214, 210, 204)
CERAMIC = (204, 176, 140)
CERAMIC_D = (168, 136, 100)
LEAF = (66, 148, 76)
LEAF_D = (44, 114, 54)
LEAF_HI = (102, 180, 108)
POT_TERR = (176, 100, 68)
POT_TERR_D = (140, 76, 48)
GLASS = (148, 188, 208)
GLASS_HI = (210, 230, 238)
WOOD_LEG = (96, 62, 34)
CLOTH = (214, 90, 78)
CLOTH_D = (168, 60, 52)


def blank(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def rgba(c: tuple[int, int, int], a: int = 255) -> tuple[int, int, int, int]:
    return (*c, a)


def clamp(v: int) -> int:
    return max(0, min(255, v))


def shade(c: tuple[int, int, int], dr: int, dg: int = 0, db: int = 0) -> tuple[int, int, int]:
    return (clamp(c[0] + dr), clamp(c[1] + dg), clamp(c[2] + db))


def put(im: Image.Image, x: int, y: int, c: tuple[int, int, int], a: int = 255) -> None:
    if 0 <= x < im.width and 0 <= y < im.height:
        im.putpixel((x, y), rgba(c, a))


def fill_rect(
    im: Image.Image,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    c: tuple[int, int, int],
    a: int = 255,
) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle([x0, y0, x1, y1], fill=rgba(c, a))


def outline_rect(
    im: Image.Image,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    fill: tuple[int, int, int],
    outline: tuple[int, int, int],
) -> None:
    d = ImageDraw.Draw(im)
    d.rectangle([x0, y0, x1, y1], fill=rgba(fill), outline=rgba(outline))


def hline(im: Image.Image, x0: int, x1: int, y: int, c: tuple[int, int, int]) -> None:
    d = ImageDraw.Draw(im)
    d.line([(x0, y), (x1, y)], fill=rgba(c))


def vline(im: Image.Image, x: int, y0: int, y1: int, c: tuple[int, int, int]) -> None:
    d = ImageDraw.Draw(im)
    d.line([(x, y0), (x, y1)], fill=rgba(c))


def hash2(x: int, y: int, salt: int = 0) -> int:
    n = (x * 374761393 + y * 668265263 + salt * 1274126177) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return n


# --- Floors / walls / door (32×32) -------------------------------------------------


def wood_floor(seed_shift: int = 0) -> Image.Image:
    """Honey oak running-bond planks with soft seams (no harsh stripe bands)."""
    im = blank(TILE, TILE)
    plank_h = 8
    for row in range(TILE // plank_h):
        y0 = row * plank_h
        base = OAK[(row + seed_shift) % len(OAK)]
        # staggered board breaks
        breaks = sorted(
            {
                (4 + (row + seed_shift) * 13) % 30 + 1,
                (18 + (row + seed_shift * 3) * 7) % 30 + 1,
            }
        )
        for y in range(y0, y0 + plank_h):
            for x in range(TILE):
                # soft vertical grain + tiny noise
                noise = ((hash2(x, y, seed_shift) >> 8) % 7) - 3
                grain = 2 if (x + row * 5 + seed_shift) % 9 == 0 else 0
                # slight darkening toward board bottom edge
                edge = 0
                if y == y0 + plank_h - 1:
                    edge = -10
                elif y == y0:
                    edge = 6
                c = shade(base, noise + grain + edge, noise // 2 + edge // 2, edge // 3)
                put(im, x, y, c)
        # soft seam (not a chocolate stripe)
        seam_y = y0 + plank_h - 1
        for x in range(TILE):
            put(im, x, seam_y, shade(OAK_SEAM, ((x + seed_shift) % 3) - 1))
        for bx in breaks:
            for y in range(y0, seam_y):
                put(im, bx, y, OAK_SEAM)
                if y % 3 == 0:
                    put(im, bx, y, shade(OAK_SEAM, 8, 6, 4))
    # sparse knots
    knots = [
        (5 + seed_shift, 3),
        (21, 6 + seed_shift % 2),
        (12, 14),
        (27, 19),
        (8, 25),
        (19, 29),
    ]
    for x, y in knots:
        put(im, x % TILE, y % TILE, OAK_KNOT)
        put(im, (x + 1) % TILE, y % TILE, OAK_GRAIN)
    return im


def kitchen_floor(seed_shift: int = 0) -> Image.Image:
    """Warm cream ceramic with thin grout — cozy kitchen, not teal grid."""
    im = blank(TILE, TILE)
    cell = 8
    for y in range(TILE):
        for x in range(TILE):
            cx = x // cell
            cy = y // cell
            on = (cx + cy + seed_shift) % 2 == 0
            lx = x % cell
            ly = y % cell
            # thin 1px grout
            if lx == 0 or ly == 0:
                put(im, x, y, TILE_GROUT)
                continue
            base = TILE_A if on else TILE_B
            # soft bevel: highlight TL, shadow BR
            if lx <= 2 and ly <= 2:
                c = TILE_HI if on else shade(TILE_B, 10, 8, 6)
            elif lx >= cell - 2 or ly >= cell - 2:
                c = TILE_LO if on else shade(TILE_B, -8, -6, -4)
            else:
                speck = ((hash2(x, y, seed_shift) >> 4) % 11) - 5
                c = shade(base, speck // 2, speck // 3, speck // 4)
            put(im, x, y, c)
    return im


def wall() -> Image.Image:
    im = blank(TILE, TILE)
    # warm paper upper
    fill_rect(im, 0, 0, TILE - 1, 18, PAPER)
    for y in range(19):
        for x in range(TILE):
            if (hash2(x, y, 3) % 17) == 0:
                put(im, x, y, PAPER_D)
    # subtle damask diamonds
    for y, x in [(4, 6), (4, 17), (4, 27), (10, 11), (10, 22), (16, 6), (16, 17), (16, 27)]:
        put(im, x, y, SAGE_HI)
        put(im, x + 1, y + 1, SAGE)
        put(im, x, y + 1, PAPER_D)
    # chair rail with highlight
    hline(im, 0, TILE - 1, 18, WAINSCOT_D)
    hline(im, 0, TILE - 1, 19, WAINSCOT)
    hline(im, 0, TILE - 1, 20, shade(WAINSCOT, 12, 10, 8))
    # sage wainscot panels with inset depth
    fill_rect(im, 0, 21, TILE - 1, TILE - 1, SAGE)
    panels = [(1, 9), (11, 19), (21, 30)]
    for x0, x1 in panels:
        outline_rect(im, x0, 22, x1, 30, SAGE_D, shade(SAGE_D, -12, -10, -8))
        fill_rect(im, x0 + 1, 23, x1 - 1, 29, SAGE)
        hline(im, x0 + 1, x1 - 1, 23, SAGE_HI)
        vline(im, x0 + 1, 23, 29, SAGE_HI)
    hline(im, 0, TILE - 1, TILE - 1, WAINSCOT_D)
    return im


def door() -> Image.Image:
    im = blank(TILE, TILE)
    outline_rect(im, 2, 0, 29, 31, WALNUT_D, CHAR)
    outline_rect(im, 4, 1, 27, 30, WALNUT, WALNUT_D)
    # wood grain on slab
    for y in range(2, 30):
        for x in (6, 12, 20, 25):
            if (y + x) % 4 == 0:
                put(im, x, y, WALNUT_HI)
    outline_rect(im, 7, 4, 24, 14, GLASS, WALNUT_D)
    fill_rect(im, 8, 5, 23, 13, GLASS)
    put(im, 9, 6, GLASS_HI)
    put(im, 10, 6, GLASS_HI)
    put(im, 9, 7, GLASS_HI)
    vline(im, 15, 4, 14, WALNUT_D)
    hline(im, 7, 24, 9, WALNUT_D)
    outline_rect(im, 7, 17, 14, 27, WALNUT_HI, WALNUT_D)
    outline_rect(im, 17, 17, 24, 27, WALNUT_HI, WALNUT_D)
    fill_rect(im, 8, 18, 13, 26, WALNUT)
    fill_rect(im, 18, 18, 23, 26, WALNUT)
    fill_rect(im, 22, 15, 24, 17, BRASS)
    put(im, 23, 16, COPPER_HI)
    return im


# --- Furniture helpers (32×48, mass low) -------------------------------------------


def base_counter(
    top: tuple[int, int, int] = STEEL_HI,
    body: tuple[int, int, int] = STEEL,
    rim: tuple[int, int, int] = STEEL_D,
    y_top: int = 18,
    y_bottom: int = 44,
) -> Image.Image:
    im = blank(FURN_W, FURN_H)
    fill_rect(im, 3, y_bottom + 1, 28, y_bottom + 2, CHAR, 90)
    outline_rect(im, 2, y_top, 29, y_bottom, body, rim)
    fill_rect(im, 2, y_top, 29, y_top + 4, top)
    hline(im, 2, 29, y_top, rim)
    hline(im, 2, 29, y_top + 4, rim)
    # side bevels
    vline(im, 3, y_top + 5, y_bottom - 1, shade(body, 18, 18, 18))
    vline(im, 28, y_top + 5, y_bottom - 1, shade(body, -22, -22, -22))
    fill_rect(im, 4, y_top + 5, 27, y_bottom - 1, body)
    fill_rect(im, 4, y_bottom - 3, 27, y_bottom - 1, STEEL_DK if body == STEEL else WALNUT_D)
    fill_rect(im, 4, y_bottom - 1, 6, y_bottom + 1, WOOD_LEG)
    fill_rect(im, 25, y_bottom - 1, 27, y_bottom + 1, WOOD_LEG)
    return im


def draw_knob(im: Image.Image, x: int, y: int) -> None:
    put(im, x, y, BRASS)
    put(im, x + 1, y, BRASS)
    put(im, x, y + 1, COPPER_D)
    put(im, x + 1, y + 1, shade(BRASS, -20, -20, -10))


# --- Furniture / stations ----------------------------------------------------------


def table_2seat() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    # perspective-ish oval top via layered rects
    fill_rect(im, 6, 36, 8, 45, WOOD_LEG)
    fill_rect(im, 23, 36, 25, 45, WOOD_LEG)
    fill_rect(im, 6, 44, 25, 45, WOOD_LEG)
    outline_rect(im, 3, 22, 28, 36, WALNUT, WALNUT_D)
    fill_rect(im, 4, 23, 27, 34, WALNUT_HI)
    # rim shade + grain
    hline(im, 4, 27, 23, shade(WALNUT_HI, 16, 12, 8))
    hline(im, 5, 26, 26, WALNUT)
    hline(im, 5, 26, 30, WALNUT)
    hline(im, 4, 27, 34, WALNUT_D)
    # place settings
    outline_rect(im, 7, 26, 13, 32, CREAM, CREAM_D)
    outline_rect(im, 18, 26, 24, 32, CREAM, CREAM_D)
    put(im, 10, 28, GLASS)
    put(im, 21, 28, GLASS)
    put(im, 9, 29, CLOTH)
    put(im, 20, 29, CLOTH)
    return im


def chair() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    fill_rect(im, 9, 38, 11, 46, WOOD_LEG)
    fill_rect(im, 20, 38, 22, 46, WOOD_LEG)
    outline_rect(im, 7, 30, 24, 38, WALNUT_HI, WALNUT_D)
    fill_rect(im, 8, 31, 23, 36, WALNUT)
    # red diner cushion
    fill_rect(im, 9, 32, 22, 35, CLOTH)
    hline(im, 9, 22, 32, shade(CLOTH, 20, 10, 8))
    hline(im, 9, 22, 35, CLOTH_D)
    outline_rect(im, 8, 12, 23, 30, WALNUT, WALNUT_D)
    fill_rect(im, 9, 13, 22, 28, WALNUT_HI)
    for x in (11, 15, 19):
        vline(im, x, 14, 27, WALNUT_D)
    hline(im, 9, 22, 16, WALNUT_D)
    hline(im, 9, 22, 13, shade(WALNUT_HI, 14, 10, 6))
    return im


def prep_station() -> Image.Image:
    im = base_counter(STEEL_HI, STEEL, STEEL_D, 20, 44)
    outline_rect(im, 5, 22, 18, 30, WALNUT_HI, WALNUT_D)
    fill_rect(im, 6, 23, 17, 29, WALNUT)
    hline(im, 7, 16, 25, WALNUT_D)
    hline(im, 7, 16, 27, WALNUT_D)
    # knife
    hline(im, 20, 26, 24, STEEL_DK)
    put(im, 20, 24, STEEL_HI)
    fill_rect(im, 26, 23, 28, 25, WALNUT)
    # hanging towel
    fill_rect(im, 22, 32, 27, 38, CREAM)
    hline(im, 22, 27, 33, CREAM_D)
    put(im, 24, 36, SAGE)
    return im


def grill() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    outline_rect(im, 4, 8, 27, 18, STEEL_D, STEEL_DK)
    fill_rect(im, 5, 9, 26, 17, STEEL)
    fill_rect(im, 10, 6, 21, 9, STEEL_DK)
    fill_rect(im, 12, 4, 19, 6, SMOKE)
    body = base_counter(CHAR, STEEL_DK, CHAR, 18, 44)
    im.alpha_composite(body)
    fill_rect(im, 4, 20, 27, 28, CHAR)
    for x in range(5, 27, 3):
        vline(im, x, 20, 28, SMOKE)
    for y in (22, 25):
        hline(im, 4, 27, y, (64, 56, 48))
    for x in (8, 14, 20):
        draw_knob(im, x, 32)
    for x in (10, 16, 22):
        put(im, x, 27, COPPER)
        put(im, x + 1, 27, COPPER_HI)
    return im


def oven() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    outline_rect(im, 3, 10, 28, 44, STEEL, STEEL_DK)
    fill_rect(im, 4, 11, 27, 43, STEEL_D)
    fill_rect(im, 4, 11, 27, 18, STEEL_DK)
    for cx, cy in [(9, 14), (16, 14), (23, 14), (9, 17), (16, 17), (23, 17)]:
        put(im, cx, cy, CHAR)
        put(im, cx + 1, cy, CHAR)
    outline_rect(im, 7, 22, 24, 36, CHAR, STEEL_DK)
    fill_rect(im, 8, 23, 23, 35, (40, 36, 48))
    fill_rect(im, 10, 26, 21, 32, COPPER_D)
    put(im, 14, 28, COPPER_HI)
    put(im, 15, 29, COPPER)
    fill_rect(im, 9, 20, 22, 21, STEEL_HI)
    fill_rect(im, 5, 44, 7, 46, WOOD_LEG)
    fill_rect(im, 24, 44, 26, 46, WOOD_LEG)
    return im


def fryer() -> Image.Image:
    im = base_counter(STEEL_HI, STEEL, STEEL_D, 22, 44)
    outline_rect(im, 5, 14, 14, 26, STEEL_DK, STEEL_DK)
    outline_rect(im, 17, 14, 26, 26, STEEL_DK, STEEL_DK)
    fill_rect(im, 6, 15, 13, 25, (196, 156, 48))
    fill_rect(im, 18, 15, 25, 25, (196, 156, 48))
    hline(im, 7, 12, 17, (220, 190, 90))
    hline(im, 19, 24, 17, (220, 190, 90))
    for ox in (6, 18):
        fill_rect(im, ox, 12, ox + 7, 14, STEEL_HI)
        vline(im, ox + 1, 14, 22, STEEL_DK)
        vline(im, ox + 6, 14, 22, STEEL_DK)
    fill_rect(im, 5, 34, 26, 38, STEEL_DK)
    return im


def stockpot() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    outline_rect(im, 8, 36, 23, 44, STEEL_D, STEEL_DK)
    fill_rect(im, 9, 37, 22, 43, STEEL)
    for x in (11, 15, 19):
        put(im, x, 40, CHAR)
    outline_rect(im, 6, 16, 25, 38, STEEL_HI, STEEL_DK)
    fill_rect(im, 7, 17, 24, 36, STEEL)
    fill_rect(im, 8, 28, 23, 36, STEEL_D)
    hline(im, 6, 25, 16, STEEL_HI)
    hline(im, 7, 24, 18, STEEL_D)
    fill_rect(im, 2, 22, 6, 26, STEEL_DK)
    fill_rect(im, 25, 22, 29, 26, STEEL_DK)
    for x, y in [(12, 10), (16, 8), (20, 11), (14, 6)]:
        put(im, x, y, GLASS_HI, 180)
        put(im, x, y + 1, GLASS, 120)
    fill_rect(im, 10, 20, 21, 24, COPPER_D)
    return im


def cold_station() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    outline_rect(im, 2, 12, 29, 44, STEEL, STEEL_DK)
    fill_rect(im, 3, 13, 28, 43, STEEL_HI)
    outline_rect(im, 4, 8, 27, 20, GLASS, STEEL_D)
    fill_rect(im, 5, 9, 26, 19, GLASS_HI)
    for x in range(6, 26, 4):
        put(im, x, 11, (255, 255, 255))
    fill_rect(im, 5, 22, 14, 30, (200, 220, 230))
    fill_rect(im, 17, 22, 26, 30, (200, 220, 230))
    fill_rect(im, 6, 24, 13, 28, (120, 170, 90))
    fill_rect(im, 18, 24, 25, 28, (200, 100, 80))
    for x in range(6, 26, 3):
        vline(im, x, 36, 40, STEEL_D)
    fill_rect(im, 4, 44, 6, 46, WOOD_LEG)
    fill_rect(im, 25, 44, 27, 46, WOOD_LEG)
    return im


def pastry_bench() -> Image.Image:
    im = base_counter(MARBLE, WALNUT, WALNUT_D, 22, 44)
    fill_rect(im, 2, 22, 29, 27, MARBLE)
    put(im, 8, 24, MARBLE_V)
    put(im, 18, 25, MARBLE_V)
    put(im, 24, 23, MARBLE_V)
    fill_rect(im, 6, 18, 22, 20, WALNUT_HI)
    put(im, 5, 19, WALNUT_D)
    put(im, 23, 19, WALNUT_D)
    fill_rect(im, 10, 28, 16, 32, CREAM)
    put(im, 12, 29, CREAM_D)
    outline_rect(im, 20, 28, 27, 34, STEEL, STEEL_D)
    fill_rect(im, 21, 29, 26, 33, STEEL_HI)
    return im


def smoker() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    outline_rect(im, 8, 6, 23, 42, SMOKE, CHAR)
    fill_rect(im, 9, 7, 22, 41, (110, 86, 64))
    for y in (12, 22, 32):
        hline(im, 8, 23, y, STEEL_DK)
        hline(im, 8, 23, y + 1, STEEL)
    fill_rect(im, 14, 2, 17, 8, STEEL_DK)
    fill_rect(im, 13, 1, 18, 2, STEEL)
    outline_rect(im, 11, 24, 20, 36, CHAR, CHAR)
    fill_rect(im, 12, 25, 19, 35, (80, 60, 44))
    draw_knob(im, 18, 29)
    for x, y in [(15, 0), (16, 0), (14, 1)]:
        put(im, x, y, GLASS_HI, 140)
    fill_rect(im, 9, 42, 12, 46, STEEL_DK)
    fill_rect(im, 19, 42, 22, 46, STEEL_DK)
    return im


def wok() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    outline_rect(im, 8, 34, 23, 44, STEEL_D, STEEL_DK)
    fill_rect(im, 9, 35, 22, 43, STEEL)
    fill_rect(im, 12, 38, 19, 41, CHAR)
    d = ImageDraw.Draw(im)
    d.ellipse([4, 16, 27, 38], fill=rgba(COPPER_D), outline=rgba(CHAR))
    d.ellipse([7, 18, 24, 34], fill=rgba(COPPER))
    d.ellipse([10, 20, 21, 28], fill=rgba(COPPER_HI))
    fill_rect(im, 24, 24, 30, 27, WOOD_LEG)
    fill_rect(im, 28, 23, 31, 28, WALNUT_D)
    put(im, 14, 22, (220, 180, 80))
    put(im, 17, 24, LEAF)
    return im


def fermentation_crock() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    d = ImageDraw.Draw(im)
    d.ellipse([6, 18, 25, 44], fill=rgba(CERAMIC), outline=rgba(CERAMIC_D))
    fill_rect(im, 8, 24, 23, 40, CERAMIC)
    fill_rect(im, 20, 28, 23, 38, CERAMIC_D)
    d.ellipse([8, 12, 23, 22], fill=rgba(CERAMIC_D), outline=rgba(WALNUT_D))
    fill_rect(im, 13, 10, 18, 14, CERAMIC_D)
    put(im, 15, 9, WALNUT)
    fill_rect(im, 12, 14, 19, 17, SMOKE)
    vline(im, 9, 26, 36, CREAM)
    fill_rect(im, 10, 42, 21, 46, WOOD_LEG)
    return im


def barista_station() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    body = base_counter(WALNUT_HI, WALNUT, WALNUT_D, 28, 44)
    im.alpha_composite(body)
    outline_rect(im, 6, 8, 22, 28, STEEL, STEEL_DK)
    fill_rect(im, 7, 9, 21, 27, STEEL_HI)
    d = ImageDraw.Draw(im)
    d.ellipse([8, 4, 20, 14], fill=rgba(STEEL), outline=rgba(STEEL_DK))
    fill_rect(im, 10, 18, 18, 22, STEEL_DK)
    fill_rect(im, 14, 22, 16, 26, STEEL_DK)
    vline(im, 20, 14, 24, STEEL_DK)
    put(im, 20, 24, STEEL_HI)
    outline_rect(im, 24, 22, 28, 28, CREAM, WALNUT_D)
    fill_rect(im, 25, 23, 27, 27, CREAM_D)
    fill_rect(im, 8, 26, 20, 28, STEEL_D)
    return im


def spice_rack() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    outline_rect(im, 5, 6, 26, 44, WALNUT, WALNUT_D)
    fill_rect(im, 6, 7, 25, 43, WALNUT_HI)
    for y in (14, 24, 34):
        hline(im, 6, 25, y, WALNUT_D)
        fill_rect(im, 6, y + 1, 25, y + 2, WALNUT)
    jars = [
        (8, 8, COPPER),
        (14, 8, LEAF),
        (20, 8, (180, 60, 60)),
        (8, 18, BRASS),
        (14, 18, (120, 80, 160)),
        (20, 18, (60, 100, 160)),
        (8, 28, (200, 120, 40)),
        (14, 28, (80, 140, 80)),
        (20, 28, (160, 50, 50)),
    ]
    for x, y, c in jars:
        outline_rect(im, x, y, x + 4, y + 5, c, WALNUT_D)
        fill_rect(im, x + 1, y + 1, x + 3, y + 4, c)
        put(im, x + 2, y, GLASS_HI)
    fill_rect(im, 8, 36, 23, 42, WALNUT_D)
    return im


def decor_plant() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    d = ImageDraw.Draw(im)
    d.polygon(
        [(10, 30), (22, 30), (20, 46), (12, 46)],
        fill=rgba(POT_TERR),
        outline=rgba(POT_TERR_D),
    )
    fill_rect(im, 11, 31, 20, 34, COPPER_HI)
    fill_rect(im, 12, 40, 19, 45, POT_TERR_D)
    fill_rect(im, 12, 30, 19, 32, WOOD_LEG)
    d.ellipse([4, 8, 18, 28], fill=rgba(LEAF_D), outline=rgba(LEAF_D))
    d.ellipse([14, 6, 28, 26], fill=rgba(LEAF), outline=rgba(LEAF_D))
    d.ellipse([8, 2, 22, 18], fill=rgba(LEAF_HI), outline=rgba(LEAF))
    for x, y in [(6, 14), (10, 6), (16, 4), (22, 10), (24, 18), (12, 16)]:
        put(im, x, y, LEAF_HI)
        put(im, x + 1, y + 1, LEAF)
    vline(im, 15, 26, 30, (70, 100, 50))
    return im


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    assets: dict[str, Image.Image] = {
        "floor_wood_a": wood_floor(0),
        "floor_wood_b": wood_floor(1),
        "floor_kitchen_a": kitchen_floor(0),
        "floor_kitchen_b": kitchen_floor(1),
        "wall": wall(),
        "door": door(),
        "table_2seat": table_2seat(),
        "chair": chair(),
        "prep_station": prep_station(),
        "grill": grill(),
        "oven": oven(),
        "fryer": fryer(),
        "stockpot": stockpot(),
        "cold_station": cold_station(),
        "pastry_bench": pastry_bench(),
        "smoker": smoker(),
        "wok": wok(),
        "fermentation_crock": fermentation_crock(),
        "barista_station": barista_station(),
        "spice_rack": spice_rack(),
        "decor_plant": decor_plant(),
    }

    tile_names = {
        "floor_wood_a",
        "floor_wood_b",
        "floor_kitchen_a",
        "floor_kitchen_b",
        "wall",
        "door",
    }
    for name, im in assets.items():
        expected = (TILE, TILE) if name in tile_names else (FURN_W, FURN_H)
        if im.size != expected:
            raise SystemExit(f"{name}: expected {expected}, got {im.size}")
        dest = OUT / f"{name}.png"
        im.save(dest)
        print(f"wrote {dest} ({im.width}x{im.height})")


if __name__ == "__main__":
    main()
    sys.exit(0)
