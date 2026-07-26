# Track A — Visual Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placeholder restaurant tiles/furniture and purple-void UI with a coherent generated cozy ¾ diner look that ships on `main`.

**Architecture:** Improve `scripts/build-restaurant-tiles.py` to emit 32×32 floors/walls and 32×48 tall furniture; pack via existing `pack-atlas.py` (variable frame sizes already supported); feet-align in `FurnitureLayer` / wall draw in `GridLayer`; warm CSS design tokens across overlay UI; keep Kenney Urban walk frames (honest credits) with optional project-CC0 chef hat overlay if needed for cook identity.

**Tech Stack:** Python 3 + Pillow, `scripts/build-assets.ts`, PixiJS 8 sprites, CSS custom properties, Vitest.

## Global Constraints

- CC0 only; generated art credited as Val's Kitchen / project-generated — never fake Kenney provenance.
- Fast suite must stay green; do not weaken tests.
- Initial JS gzip ≤ 280,000; atlases lazy.
- Logical grid unchanged: `TILE_PX = 32`.
- Scope fence: no service verbs, balance, tutorial rewrite (Tracks B–D).
- Node: prefer `/home/bazzite/actions-runner/externals.2.336.0/node24/bin/node` + `node node_modules/.bin/...`.
- Repo: `/home/bazzite/CursorProjects/Val Stuff/Restaurant Simulator`.

---

### Task 1: Rich restaurant tile / furniture generator

**Files:**
- Modify: `scripts/build-restaurant-tiles.py`
- Output: `vendor/generated/restaurant-tiles/*.png` (regenerated)
- Modify: `scripts/build-assets.ts` (credit approximation notes: remove “placeholders”)

**Interfaces:**
- Consumes: Pillow drawing API
- Produces: PNGs named exactly as today’s `TILE_SPRITES` / `FURNITURE_SPRITES` keys map to (`floor_wood_a.png`, `table_2seat.png`, …). Floors/walls/door: **32×32**. Furniture/stations/decor/chair/table: **32×48** (transparent top padding OK; opaque mass in lower ~32px with silhouette above).

- [ ] **Step 1: Rewrite generator with cozy diner palette helpers**

Implement shared colors and helpers in `build-restaurant-tiles.py`:

```python
# Palette (RGB)
OAK = [(168, 118, 70), (158, 108, 62), (178, 128, 78), (148, 100, 56)]
WALL_CREAM = (232, 220, 198)
WALL_SAGE = (180, 196, 168)
WAINSCOT = (120, 78, 48)
KITCHEN_A = (198, 214, 210)
KITCHEN_B = (176, 196, 192)
STEEL = (176, 184, 192)
COPPER = (180, 110, 70)
```

Floors: plank seams every 8px, subtle noise speckles, two variants via seed.  
Kitchen: 8×8 checker with grout lines + soft highlight.  
Wall: cream upper + dark wainscot band + two brick/stud dots.  
Door: walnut frame, teal glass panes, brass knob.  
Table: oval/rect top with rim highlight + legs in lower band.  
Chair: seat + backrest silhouette distinct from table.  
Stations: shared steel counter base + unique top prop (flame grill, oven door, fryer basket, pot, blue cold, etc.).  
Plant: pot + layered foliage (not a chair clone).

- [ ] **Step 2: Run generator**

```bash
python3 scripts/build-restaurant-tiles.py
```

Expected: writes all PNGs under `vendor/generated/restaurant-tiles/`; table/chair/stations are 32×48; floors/walls/door 32×32.

- [ ] **Step 3: Update CREDITS approximation notes in build-assets.ts**

Change furniture note from “placeholders” to “Generated 32×48 cozy diner furniture/stations (project CC0).”  
Change tiles note to “Generated 32×32 cozy diner floor/wall/door tiles (project CC0).”

---

### Task 2: Rebuild atlases + feet-aligned furniture draw

**Files:**
- Modify: `scripts/build-assets.ts` (packer cell size for tiles/furniture — use cell=48 for furniture atlas so 32×48 fits; tiles cell=32, no scale-up)
- Modify: `src/canvas/layers/FurnitureLayer.ts`
- Modify: `src/canvas/layers/GridLayer.ts` (if wall/door assume square — ensure 32×32 textures stretch to TILE_PX correctly)
- Test: `src/test/canvas/furniture-feet-align.test.ts` (new) OR extend existing canvas test if present

**Interfaces:**
- Consumes: atlas frame `sourceSize` / texture height
- Produces: furniture sprite positioned so **bottom of texture aligns to bottom of tile cell** (`y = TILE_PX - textureDisplayHeight`)

- [ ] **Step 1: Adjust packer calls**

In `build-assets.ts` main pack section, pack furniture with `cell=48` (or omit cell to auto max dimension). Pack tiles with `cell=32` and **scale=1** (sources already 32). Characters remain Kenney 16→32 via existing scale=2 if sources are 16.

- [ ] **Step 2: Feet-align FurnitureLayer**

```typescript
function fitFurnitureSprite(sprite: Sprite, texture: Texture): void {
  const scale = TILE_PX / 32; // art designed at 32px tile width
  const w = texture.width * scale;
  const h = texture.height * scale;
  sprite.texture = texture;
  sprite.width = w;
  sprite.height = h;
  sprite.position.set((TILE_PX - w) / 2, TILE_PX - h);
}
```

Apply in `drawChair` and `drawSprite`. Keep hit area on the 32×32 logical cell (+ padding).

- [ ] **Step 3: Rebuild assets**

```bash
node --import tsx scripts/build-assets.ts
# or package.json script equivalent via node node_modules/.bin/
```

Expected: `public/assets/atlases/furniture.png` ≫ 839 B; tiles larger; CREDITS updated.

- [ ] **Step 4: Unit test feet alignment math**

Extract or test pure helper: given texture 32×48 and TILE_PX 32, offsetY === -16 (or TILE_PX - h).

- [ ] **Step 5: Run fast suite subset + audit**

```bash
node node_modules/.bin/vitest run src/test/canvas --reporter=dot
node --import tsx scripts/audit-assets.ts
```

---

### Task 3: Character readability pass

**Files:**
- Modify: `scripts/build-assets.ts` (`CHARACTER_SPRITES` — ensure guest A/B full 4-dir×3 if available from Urban pack; keep honest Kenney credits)
- Optional create: `scripts/build-character-sheets.py` only if Urban frames insufficient for cook identity — prefer **recolor apron pixels** via small post-process on player frames into `vendor/generated/characters/` credited as project overlay + Kenney base noted in approximationNote
- Modify: `src/canvas/world/ActorLayer.ts` only if draw scale needs tweak for new frame sizes

**Interfaces:**
- Produces: player still `player_{facing}_{0|1|2}`; guests `guest_{a|b}_*`

- [ ] **Step 1: Expand guest B walk aliases** to mirror player facing keys if Urban tiles exist (tile indices for red shirt cycle).

- [ ] **Step 2: Optional cook cue** — if time: generate 32×32 apron recolor of green shirt frames into generated folder; wire build-assets to prefer generated player frames with credit note “Kenney Urban base + project apron recolor (CC0).”

- [ ] **Step 3: Confirm ActorLayer player 64px / guest 32px still correct for 32×32 atlas frames.

---

### Task 4: Warm diner UI palette

**Files:**
- Modify: `src/ui/styles/global.css`
- Modify: `src/ui/styles/screens.css`
- Modify: `src/ui/styles/service-day.css`

**Interfaces:**
- Produces: CSS variables on `:root` / `.game-shell`; screens consume vars (no purple `#1a1a2e` / `#2a2a42` remaining as primary surfaces).

- [ ] **Step 1: Add tokens to global.css**

```css
:root {
  --vk-bg: #2a211c;
  --vk-bg-deep: #1e1714;
  --vk-panel: #3a2f28;
  --vk-panel-2: #4a3c32;
  --vk-border: rgba(245, 230, 210, 0.14);
  --vk-text: #f6efe4;
  --vk-text-dim: rgba(246, 239, 228, 0.72);
  --vk-accent: #c4a35a; /* soft gold */
  --vk-accent-2: #7a9e7e; /* sage */
  --vk-danger: #d9897a;
  --vk-font: "Segoe UI", "Trebuchet MS", "Nunito Sans", sans-serif;
}
```

Map `body`, `.layout-hud`, `.layout-btn`, inputs to tokens.

- [ ] **Step 2: Replace hardcoded purple/dark panel colors in screens.css and service-day.css** with `var(--vk-*)`.

- [ ] **Step 3: Visual smoke** — `npm run build` / vite build succeeds; no CSS syntax errors.

---

### Task 5: Doc-sync, verify, ship to main

**Files:**
- Modify: `docs/Progress.md`
- Spec already: `docs/superpowers/specs/2026-07-26-cozy-restaurant-professional-program-design.md`

- [ ] **Step 1: Update Progress** — add Track A row / changelog; mark visual identity in progress→done when green.

- [ ] **Step 2: Full fast suite + bundle check**

```bash
node node_modules/.bin/vitest run --reporter=dot
node --import tsx scripts/check-bundle-size.ts
```

- [ ] **Step 3: Commit on `fix/customer-scoring-spread` (or stay on it)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(art): cozy generated restaurant identity (Track A)

EOF
)"
```

- [ ] **Step 4: Push branch, merge to main, push main** (SSH needs `all` permissions).

---

## Parallel ownership fences

| Stream | Owns | Must not touch |
|--------|------|----------------|
| Art gen | `scripts/build-restaurant-tiles.py`, `vendor/generated/restaurant-tiles/**`, character gen scripts, parts of `build-assets.ts` sprites maps/credits | `src/ui/styles/**`, `FurnitureLayer.ts` |
| Canvas wire | `FurnitureLayer.ts`, `GridLayer.ts`, `ActorLayer.ts`, canvas tests | `build-restaurant-tiles.py`, CSS |
| UI palette | `src/ui/styles/*.css` | asset scripts, canvas layers |

Lead integrates packer cell sizes + final rebuild + commit.

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Generated floors/walls/door | 1 |
| Furniture/stations/decor | 1–2 |
| Characters readable | 3 |
| UI palette | 4 |
| Pipeline + CREDITS | 1–2, 5 |
| Ship main | 5 |
