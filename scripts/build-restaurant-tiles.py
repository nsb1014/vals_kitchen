#!/usr/bin/env python3
"""Generate project-CC0 cozy diner restaurant tiles (Chef RPG–style).

Floors / walls / door: 32×32
Furniture / stations / decor: 32×48 (tall for Y-sort; mass in lower portion)
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

# Cozy diner palette — oak, cream/sage, teal kitchen, walnut, steel, copper
OAK = [
    (176, 122, 72),
    (166, 112, 64),
    (186, 132, 82),
    (156, 104, 58),
    (146, 96, 52),
]
OAK_SEAM = (120, 78, 42)
OAK_GRAIN = (196, 146, 96)

TEAL_A = (74, 148, 148)
TEAL_B = (58, 128, 128)
TEAL_GROUT = (42, 88, 88)
TEAL_HI = (96, 168, 168)

CREAM = (232, 224, 208)
CREAM_D = (214, 204, 184)
SAGE = (168, 184, 154)
SAGE_D = (140, 158, 128)
WAINSCOT = (196, 178, 148)
WAINSCOT_D = (168, 148, 118)

WALNUT = (108, 68, 38)
WALNUT_D = (82, 50, 28)
WALNUT_HI = (138, 92, 54)
STEEL = (168, 176, 186)
STEEL_HI = (210, 216, 224)
STEEL_D = (118, 126, 136)
STEEL_DK = (78, 84, 94)
COPPER = (200, 120, 64)
COPPER_D = (168, 88, 48)
COPPER_HI = (228, 156, 96)
BRASS = (200, 168, 72)
CHAR = (48, 44, 40)
SMOKE = (96, 92, 88)
MARBLE = (236, 232, 228)
MARBLE_V = (210, 206, 200)
CERAMIC = (196, 168, 132)
CERAMIC_D = (160, 128, 96)
LEAF = (62, 140, 72)
LEAF_D = (42, 108, 52)
LEAF_HI = (96, 176, 100)
POT_TERR = (168, 96, 64)
POT_TERR_D = (132, 72, 48)
GLASS = (140, 180, 200)
GLASS_HI = (200, 220, 230)
WOOD_LEG = (90, 58, 32)


def blank(w: int, h: int) -> Image.Image:
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def rgba(c: tuple[int, int, int], a: int = 255) -> tuple[int, int, int, int]:
    return (*c, a)


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


# --- Floors / walls / door (32×32) -------------------------------------------------


def wood_floor(seed_shift: int = 0) -> Image.Image:
    im = blank(TILE, TILE)
    plank_h = 8
    for y in range(TILE):
        row = (y // plank_h + seed_shift) % len(OAK)
        base = OAK[row]
        for x in range(TILE):
            # subtle horizontal grain
            shade = ((x + y * 3 + seed_shift * 7) % 11) - 5
            c = (
                max(0, min(255, base[0] + shade)),
                max(0, min(255, base[1] + shade // 2)),
                max(0, min(255, base[2] + shade // 3)),
            )
            put(im, x, y, c)
    # plank seams
    for py in range(plank_h - 1, TILE, plank_h):
        hline(im, 0, TILE - 1, py, OAK_SEAM)
    # vertical board breaks offset per row
    for row in range(TILE // plank_h):
        y0 = row * plank_h
        breaks = (6 + (row + seed_shift) * 11) % 28 + 2
        for y in range(y0, min(y0 + plank_h - 1, TILE)):
            put(im, breaks, y, OAK_SEAM)
            if breaks + 14 < TILE:
                put(im, breaks + 14, y, OAK_SEAM)
    # nail / knot dots
    knots = [(3, 2 + seed_shift), (18, 5), (11, 12), (25, 14), (7, 21), (22, 28)]
    for x, y in knots:
        put(im, x % TILE, y % TILE, OAK_SEAM)
        put(im, (x + 1) % TILE, y % TILE, OAK_GRAIN)
    return im


def kitchen_floor(seed_shift: int = 0) -> Image.Image:
    im = blank(TILE, TILE)
    cell = 8
    for y in range(TILE):
        for x in range(TILE):
            cx = x // cell
            cy = y // cell
            on = (cx + cy + seed_shift) % 2 == 0
            edge = x % cell == 0 or y % cell == 0 or x % cell == cell - 1 or y % cell == cell - 1
            if edge:
                put(im, x, y, TEAL_GROUT)
            elif on:
                # soft highlight toward top-left of tile
                if x % cell < 3 and y % cell < 3:
                    put(im, x, y, TEAL_HI)
                else:
                    put(im, x, y, TEAL_A)
            else:
                put(im, x, y, TEAL_B)
    # corner dots for ceramic feel
    for cy in range(4):
        for cx in range(4):
            ox = cx * cell + 3 + (seed_shift % 2)
            oy = cy * cell + 3
            put(im, ox, oy, TEAL_GROUT if (cx + cy) % 2 else TEAL_HI)
    return im


def wall() -> Image.Image:
    im = blank(TILE, TILE)
    # cream wallpaper upper 2/3
    fill_rect(im, 0, 0, TILE - 1, 19, CREAM)
    # subtle damask dots
    for y, x in [(3, 5), (3, 16), (3, 26), (9, 10), (9, 21), (15, 5), (15, 16), (15, 26)]:
        put(im, x, y, CREAM_D)
        put(im, x + 1, y + 1, SAGE)
    # chair rail
    hline(im, 0, TILE - 1, 19, WAINSCOT_D)
    hline(im, 0, TILE - 1, 20, WAINSCOT)
    # sage wainscot panels
    fill_rect(im, 0, 21, TILE - 1, TILE - 1, SAGE)
    for px in (0, 10, 21):
        vline(im, px, 21, TILE - 1, SAGE_D)
        vline(im, px + 9 if px < 21 else TILE - 1, 21, TILE - 1, SAGE_D)
        # panel inset highlight
        fill_rect(im, px + 2, 23, min(px + 8, TILE - 2), 29, SAGE_D)
        fill_rect(im, px + 3, 24, min(px + 7, TILE - 3), 28, SAGE)
    hline(im, 0, TILE - 1, TILE - 1, WAINSCOT_D)
    return im


def door() -> Image.Image:
    im = blank(TILE, TILE)
    # door frame
    outline_rect(im, 2, 0, 29, 31, WALNUT_D, CHAR)
    # door slab
    outline_rect(im, 4, 1, 27, 30, WALNUT, WALNUT_D)
    # upper glass lite
    outline_rect(im, 7, 4, 24, 14, GLASS, WALNUT_D)
    fill_rect(im, 8, 5, 23, 13, GLASS)
    put(im, 9, 6, GLASS_HI)
    put(im, 10, 6, GLASS_HI)
    put(im, 9, 7, GLASS_HI)
    # mullion
    vline(im, 15, 4, 14, WALNUT_D)
    hline(im, 7, 24, 9, WALNUT_D)
    # lower panels
    outline_rect(im, 7, 17, 14, 27, WALNUT_HI, WALNUT_D)
    outline_rect(im, 17, 17, 24, 27, WALNUT_HI, WALNUT_D)
    fill_rect(im, 8, 18, 13, 26, WALNUT)
    fill_rect(im, 18, 18, 23, 26, WALNUT)
    # brass knob
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
    """Shared stainless/wood counter body sitting low in the tall cell."""
    im = blank(FURN_W, FURN_H)
    # shadow under unit
    fill_rect(im, 3, y_bottom + 1, 28, y_bottom + 2, CHAR, 90)
    outline_rect(im, 2, y_top, 29, y_bottom, body, rim)
    # countertop
    fill_rect(im, 2, y_top, 29, y_top + 4, top)
    hline(im, 2, 29, y_top, rim)
    hline(im, 2, 29, y_top + 4, rim)
    # front face shading
    fill_rect(im, 3, y_top + 5, 28, y_bottom - 1, body)
    fill_rect(im, 3, y_bottom - 3, 28, y_bottom - 1, STEEL_DK if body == STEEL else WALNUT_D)
    # legs
    fill_rect(im, 4, y_bottom - 1, 6, y_bottom + 1, WOOD_LEG)
    fill_rect(im, 25, y_bottom - 1, 27, y_bottom + 1, WOOD_LEG)
    return im


def draw_knob(im: Image.Image, x: int, y: int) -> None:
    put(im, x, y, BRASS)
    put(im, x + 1, y, BRASS)
    put(im, x, y + 1, COPPER_D)


# --- Furniture / stations ----------------------------------------------------------


def table_2seat() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    # legs (lower mass)
    fill_rect(im, 6, 36, 8, 45, WOOD_LEG)
    fill_rect(im, 23, 36, 25, 45, WOOD_LEG)
    fill_rect(im, 6, 44, 25, 45, WOOD_LEG)  # stretcher
    # round-ish tabletop
    outline_rect(im, 3, 22, 28, 36, WALNUT, WALNUT_D)
    fill_rect(im, 4, 23, 27, 34, WALNUT_HI)
    # wood grain lines
    hline(im, 6, 25, 26, WALNUT)
    hline(im, 5, 26, 30, WALNUT)
    # place settings hint
    fill_rect(im, 8, 27, 12, 31, CREAM)
    fill_rect(im, 19, 27, 23, 31, CREAM)
    put(im, 10, 28, GLASS)
    put(im, 21, 28, GLASS)
    return im


def chair() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    # legs
    fill_rect(im, 9, 38, 11, 46, WOOD_LEG)
    fill_rect(im, 20, 38, 22, 46, WOOD_LEG)
    # seat
    outline_rect(im, 7, 30, 24, 38, WALNUT_HI, WALNUT_D)
    fill_rect(im, 8, 31, 23, 36, WALNUT)
    # cushion
    fill_rect(im, 9, 32, 22, 35, SAGE)
    # backrest (tall silhouette)
    outline_rect(im, 8, 12, 23, 30, WALNUT, WALNUT_D)
    fill_rect(im, 9, 13, 22, 28, WALNUT_HI)
    # spindle bars
    for x in (11, 15, 19):
        vline(im, x, 14, 27, WALNUT_D)
    hline(im, 9, 22, 16, WALNUT_D)
    return im


def prep_station() -> Image.Image:
    im = base_counter(STEEL_HI, STEEL, STEEL_D, 20, 44)
    # wooden cutting board
    outline_rect(im, 5, 22, 18, 30, WALNUT_HI, WALNUT_D)
    fill_rect(im, 6, 23, 17, 29, WALNUT)
    hline(im, 7, 16, 25, WALNUT_D)
    hline(im, 7, 16, 27, WALNUT_D)
    # knife
    hline(im, 20, 26, 24, STEEL_DK)
    put(im, 20, 24, STEEL_HI)
    fill_rect(im, 26, 23, 28, 25, WALNUT)
    # towel hook
    fill_rect(im, 22, 32, 27, 38, CREAM)
    return im


def grill() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    # backsplash / short hood
    outline_rect(im, 4, 8, 27, 18, STEEL_D, STEEL_DK)
    fill_rect(im, 5, 9, 26, 17, STEEL)
    fill_rect(im, 10, 6, 21, 9, STEEL_DK)  # vent stack
    fill_rect(im, 12, 4, 19, 6, SMOKE)
    # body
    body = base_counter(CHAR, STEEL_DK, CHAR, 18, 44)
    im.alpha_composite(body)
    # grate surface
    fill_rect(im, 4, 20, 27, 28, CHAR)
    for x in range(5, 27, 3):
        vline(im, x, 20, 28, SMOKE)
    for y in (22, 25):
        hline(im, 4, 27, y, (64, 56, 48))
    # control knobs
    for x in (8, 14, 20):
        draw_knob(im, x, 32)
    # orange ember glow under grate
    for x in (10, 16, 22):
        put(im, x, 27, COPPER)
    return im


def oven() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    # tall range silhouette
    outline_rect(im, 3, 10, 28, 44, STEEL, STEEL_DK)
    fill_rect(im, 4, 11, 27, 43, STEEL_D)
    # cooktop
    fill_rect(im, 4, 11, 27, 18, STEEL_DK)
    for cx, cy in [(9, 14), (16, 14), (23, 14), (9, 17), (16, 17), (23, 17)]:
        put(im, cx, cy, CHAR)
        put(im, cx + 1, cy, CHAR)
    # oven door window
    outline_rect(im, 7, 22, 24, 36, CHAR, STEEL_DK)
    fill_rect(im, 8, 23, 23, 35, (40, 36, 48))
    # warm glow
    fill_rect(im, 10, 26, 21, 32, COPPER_D)
    put(im, 14, 28, COPPER_HI)
    # handle
    fill_rect(im, 9, 20, 22, 21, STEEL_HI)
    # legs
    fill_rect(im, 5, 44, 7, 46, WOOD_LEG)
    fill_rect(im, 24, 44, 26, 46, WOOD_LEG)
    return im


def fryer() -> Image.Image:
    im = base_counter(STEEL_HI, STEEL, STEEL_D, 22, 44)
    # dual oil vats
    outline_rect(im, 5, 14, 14, 26, STEEL_DK, STEEL_DK)
    outline_rect(im, 17, 14, 26, 26, STEEL_DK, STEEL_DK)
    fill_rect(im, 6, 15, 13, 25, (196, 156, 48))
    fill_rect(im, 18, 15, 25, 25, (196, 156, 48))
    # oil highlights
    hline(im, 7, 12, 17, (220, 190, 90))
    hline(im, 19, 24, 17, (220, 190, 90))
    # baskets
    for ox in (6, 18):
        fill_rect(im, ox, 12, ox + 7, 14, STEEL_HI)
        vline(im, ox + 1, 14, 22, STEEL_DK)
        vline(im, ox + 6, 14, 22, STEEL_DK)
    # drip tray
    fill_rect(im, 5, 34, 26, 38, STEEL_DK)
    return im


def stockpot() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    # burner stand
    outline_rect(im, 8, 36, 23, 44, STEEL_D, STEEL_DK)
    fill_rect(im, 9, 37, 22, 43, STEEL)
    for x in (11, 15, 19):
        put(im, x, 40, CHAR)
    # pot body (round silhouette)
    outline_rect(im, 6, 16, 25, 38, STEEL_HI, STEEL_DK)
    fill_rect(im, 7, 17, 24, 36, STEEL)
    fill_rect(im, 8, 28, 23, 36, STEEL_D)
    # rim
    hline(im, 6, 25, 16, STEEL_HI)
    hline(im, 7, 24, 18, STEEL_D)
    # handles
    fill_rect(im, 2, 22, 6, 26, STEEL_DK)
    fill_rect(im, 25, 22, 29, 26, STEEL_DK)
    # steam
    for x, y in [(12, 10), (16, 8), (20, 11), (14, 6)]:
        put(im, x, y, GLASS_HI, 180)
        put(im, x, y + 1, GLASS, 120)
    # broth hint
    fill_rect(im, 10, 20, 21, 24, COPPER_D)
    return im


def cold_station() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    # refrigerated cabinet
    outline_rect(im, 2, 12, 29, 44, STEEL, STEEL_DK)
    fill_rect(im, 3, 13, 28, 43, STEEL_HI)
    # glass lid / sneeze guard
    outline_rect(im, 4, 8, 27, 20, GLASS, STEEL_D)
    fill_rect(im, 5, 9, 26, 19, GLASS_HI)
    for x in range(6, 26, 4):
        put(im, x, 11, (255, 255, 255))
    # ice pans
    fill_rect(im, 5, 22, 14, 30, (200, 220, 230))
    fill_rect(im, 17, 22, 26, 30, (200, 220, 230))
    # food pans (color hints)
    fill_rect(im, 6, 24, 13, 28, (120, 170, 90))
    fill_rect(im, 18, 24, 25, 28, (200, 100, 80))
    # base vents
    for x in range(6, 26, 3):
        vline(im, x, 36, 40, STEEL_D)
    fill_rect(im, 4, 44, 6, 46, WOOD_LEG)
    fill_rect(im, 25, 44, 27, 46, WOOD_LEG)
    return im


def pastry_bench() -> Image.Image:
    im = base_counter(MARBLE, WALNUT, WALNUT_D, 22, 44)
    # marble top override
    fill_rect(im, 2, 22, 29, 27, MARBLE)
    put(im, 8, 24, MARBLE_V)
    put(im, 18, 25, MARBLE_V)
    put(im, 24, 23, MARBLE_V)
    # rolling pin
    fill_rect(im, 6, 18, 22, 20, WALNUT_HI)
    put(im, 5, 19, WALNUT_D)
    put(im, 23, 19, WALNUT_D)
    # flour dust / dough
    fill_rect(im, 10, 28, 16, 32, CREAM)
    put(im, 12, 29, CREAM_D)
    # mixing bowl
    outline_rect(im, 20, 28, 27, 34, STEEL, STEEL_D)
    fill_rect(im, 21, 29, 26, 33, STEEL_HI)
    return im


def smoker() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    # tall barrel — distinctive vertical silhouette
    outline_rect(im, 8, 6, 23, 42, SMOKE, CHAR)
    fill_rect(im, 9, 7, 22, 41, (110, 86, 64))
    # metal bands
    for y in (12, 22, 32):
        hline(im, 8, 23, y, STEEL_DK)
        hline(im, 8, 23, y + 1, STEEL)
    # chimney
    fill_rect(im, 14, 2, 17, 8, STEEL_DK)
    fill_rect(im, 13, 1, 18, 2, STEEL)
    # door
    outline_rect(im, 11, 24, 20, 36, CHAR, CHAR)
    fill_rect(im, 12, 25, 19, 35, (80, 60, 44))
    draw_knob(im, 18, 29)
    # smoke wisps
    for x, y in [(15, 0), (16, 0), (14, 1)]:
        put(im, x, y, GLASS_HI, 140)
    # legs / base
    fill_rect(im, 9, 42, 12, 46, STEEL_DK)
    fill_rect(im, 19, 42, 22, 46, STEEL_DK)
    return im


def wok() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    # burner ring
    outline_rect(im, 8, 34, 23, 44, STEEL_D, STEEL_DK)
    fill_rect(im, 9, 35, 22, 43, STEEL)
    fill_rect(im, 12, 38, 19, 41, CHAR)
    # wok bowl (round)
    d = ImageDraw.Draw(im)
    d.ellipse([4, 16, 27, 38], fill=rgba(COPPER_D), outline=rgba(CHAR))
    d.ellipse([7, 18, 24, 34], fill=rgba(COPPER))
    d.ellipse([10, 20, 21, 28], fill=rgba(COPPER_HI))
    # long handle — distinctive silhouette
    fill_rect(im, 24, 24, 30, 27, WOOD_LEG)
    fill_rect(im, 28, 23, 31, 28, WALNUT_D)
    # food sizzle
    put(im, 14, 22, (220, 180, 80))
    put(im, 17, 24, LEAF)
    return im


def fermentation_crock() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    # ceramic crock — bulbous, not a box
    d = ImageDraw.Draw(im)
    d.ellipse([6, 18, 25, 44], fill=rgba(CERAMIC), outline=rgba(CERAMIC_D))
    fill_rect(im, 8, 24, 23, 40, CERAMIC)
    # belly shade
    fill_rect(im, 20, 28, 23, 38, CERAMIC_D)
    # lid
    d.ellipse([8, 12, 23, 22], fill=rgba(CERAMIC_D), outline=rgba(WALNUT_D))
    fill_rect(im, 13, 10, 18, 14, CERAMIC_D)
    put(im, 15, 9, WALNUT)
    # weight stone
    fill_rect(im, 12, 14, 19, 17, SMOKE)
    # glaze highlight
    vline(im, 9, 26, 36, CREAM)
    # wood stand
    fill_rect(im, 10, 42, 21, 46, WOOD_LEG)
    return im


def barista_station() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    # counter
    body = base_counter(WALNUT_HI, WALNUT, WALNUT_D, 28, 44)
    im.alpha_composite(body)
    # espresso machine group head
    outline_rect(im, 6, 8, 22, 28, STEEL, STEEL_DK)
    fill_rect(im, 7, 9, 21, 27, STEEL_HI)
    # boiler dome
    d = ImageDraw.Draw(im)
    d.ellipse([8, 4, 20, 14], fill=rgba(STEEL), outline=rgba(STEEL_DK))
    # portafilter
    fill_rect(im, 10, 18, 18, 22, STEEL_DK)
    fill_rect(im, 14, 22, 16, 26, STEEL_DK)
    # steam wand
    vline(im, 20, 14, 24, STEEL_DK)
    put(im, 20, 24, STEEL_HI)
    # cups
    outline_rect(im, 24, 22, 28, 28, CREAM, WALNUT_D)
    fill_rect(im, 25, 23, 27, 27, CREAM_D)
    # drip tray
    fill_rect(im, 8, 26, 20, 28, STEEL_D)
    return im


def spice_rack() -> Image.Image:
    im = blank(FURN_W, FURN_H)
    # tall open shelf unit
    outline_rect(im, 5, 6, 26, 44, WALNUT, WALNUT_D)
    fill_rect(im, 6, 7, 25, 43, WALNUT_HI)
    # shelves
    for y in (14, 24, 34):
        hline(im, 6, 25, y, WALNUT_D)
        fill_rect(im, 6, y + 1, 25, y + 2, WALNUT)
    # spice jars — colorful distinct from chairs
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
    # bottom bin
    fill_rect(im, 8, 36, 23, 42, WALNUT_D)
    return im


def decor_plant() -> Image.Image:
    """Leafy potted plant — must not resemble a chair."""
    im = blank(FURN_W, FURN_H)
    # terracotta pot (lower mass)
    d = ImageDraw.Draw(im)
    d.polygon(
        [(10, 30), (22, 30), (20, 46), (12, 46)],
        fill=rgba(POT_TERR),
        outline=rgba(POT_TERR_D),
    )
    fill_rect(im, 11, 31, 20, 34, COPPER_HI)  # rim
    fill_rect(im, 12, 40, 19, 45, POT_TERR_D)
    # soil
    fill_rect(im, 12, 30, 19, 32, WOOD_LEG)
    # leafy bush — overlapping ellipses, not a backrest
    d.ellipse([4, 8, 18, 28], fill=rgba(LEAF_D), outline=rgba(LEAF_D))
    d.ellipse([14, 6, 28, 26], fill=rgba(LEAF), outline=rgba(LEAF_D))
    d.ellipse([8, 2, 22, 18], fill=rgba(LEAF_HI), outline=rgba(LEAF))
    # leaf tips
    for x, y in [(6, 14), (10, 6), (16, 4), (22, 10), (24, 18), (12, 16)]:
        put(im, x, y, LEAF_HI)
        put(im, x + 1, y + 1, LEAF)
    # stem peek
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
