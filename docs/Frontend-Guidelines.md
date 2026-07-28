# Frontend Guidelines

**Status:** Design complete  
**Stack reference:** [Tech-Stack.md](./Tech-Stack.md)  
**Domain logic:** Lives in pure modules per [Backend-Guidelines.md](./Backend-Guidelines.md) — not in components or PixiJS classes.

---

## Table of Contents

1. [Directory Structure](#1-directory-structure)
2. [PixiJS vs DOM Boundary](#2-pixijs-vs-dom-boundary)
3. [State Management (Zustand)](#3-state-management-zustand)
4. [Game Loop & Update/Render Separation](#4-game-loop--updaterender-separation)
5. [Touch Input & Gestures](#5-touch-input--gestures)
6. [Grid Coordinate System](#6-grid-coordinate-system)
7. [Asset Loading & CC0 Attribution](#7-asset-loading--cc0-attribution)
8. [Mobile Performance Rules](#8-mobile-performance-rules)
9. [Accessibility & Readability](#9-accessibility--readability)
10. [Naming Conventions](#10-naming-conventions)
11. [Forbidden Patterns](#11-forbidden-patterns)

---

## 1. Directory Structure

```
src/
├── app/                    # Bootstrap, shell, routing between screens
│   ├── main.ts
│   ├── AppShell.ts         # 100svh container, safe areas
│   └── screenRouter.ts     # DOM screen visibility
├── canvas/                 # PixiJS-only code
│   ├── RestaurantApp.ts    # Pixi Application lifecycle
│   ├── world/              # Map, actors, nav, camera follow
│   ├── layers/             # Legacy layers during migration; prefer world/
│   ├── systems/            # DragPlacement, Camera
│   └── input/              # Pointer → grid mapping
├── ui/                     # DOM overlay screens
│   ├── components/         # HUD, compose sheet, modals
│   ├── screens/            # Shop, Settings, Recipes, etc.
│   └── styles/
├── domain/                 # Pure game logic (NO Pixi/DOM imports)
│   ├── floor/              # Seats, tickets, table lifecycle, pathfinding, mastery
│   ├── flavor/
│   ├── economy/
│   ├── rating/
│   ├── day/                # Day generation + score kernels
│   └── rng/
├── data/                   # Generated JSON: ingredients, recipes, archetypes
├── persistence/            # SaveRepository, migrations, saveCode
├── store/                  # Zustand stores + selectors
├── assets/                 # Atlases, manifest, loader
└── test/                   # Vitest unit tests mirroring domain/
```

**Rule:** `domain/` and `persistence/` must not import from `canvas/`, `ui/`, or PixiJS.

---

## 2. PixiJS vs DOM Boundary

### PixiJS Canvas Owns

| Concern | Rationale |
|---------|-----------|
| ¾ restaurant map (floor, walls, furniture) | Y-sorted pixel world |
| Player + customer actors | Walk / sit / carry / eat animations |
| Tap-to-move path following | NavController consumes domain paths |
| Layout edit ghosts / validity tint | GPU-friendly Graphics |
| Camera follow + clamp | Immersive floor, growing maps |

### DOM Overlay Owns

| Concern | Rationale |
|---------|-----------|
| All text (chat bubbles may be DOM) | Crisp text, accessibility |
| Station compose sheet | Scroll lists, 44px touch targets; dish flavor bars without numeric values |
| Ticket strip / thin service HUD | Overlay chrome; Orders panel **Order** (phrase text) + **Ideal** (flavor bars with values) |
| Flavor inspector, shop, recipes, rating | Form-like UI; inspector bars keep numeric values |
| Modals, settings, Save Code | Native inputs |
| Day summary, prestige ceremony, tutorial prompts | Rich typography |

### Chat Bubble Exception

Customer preference bubbles may render as **DOM elements positioned over canvas** (recommended) OR PixiJS BitmapText — default **DOM overlay anchored to the relevant customer seat screen position**.

### Communication Pattern

```
User tap (DOM or Pixi)
  → store action (Zustand)
    → domain floor sim + score kernels (pure)
      → store patch
        → DOM components re-render (selectors)
        → canvas scene sync (floor day, player, actors, layout)
```

Canvas **never** computes flavor scores or economy — it reflects store state. Pathfinding **results** may be computed in domain; canvas only animates along waypoints.

---

## 3. State Management (Zustand)

### Store Shape (Conceptual)

```typescript
interface GameStore {
  day: number;
  cash: number;
  prestige: number;
  rating: number;
  unlockedIngredientIds: string[];
  purchasedEquipmentIds: string[];
  discoveredRecipeIds: string[];
  recipeMastery: Record<string, { level: number; progress: number }>;
  gridSize: { w: number; h: number };
  seatingCapacity: number;
  placements: Placement[];
  floorDay: FloorDay | null; // concurrent floor service; null between days
  screen: ScreenId;
  editLayoutMode: boolean;
}

// FloorDay: guests, tables, tickets, carry, tutorial — see domain/floor/types.ts
```

### What Belongs Where

| State | Location |
|-------|----------|
| Cash, rating, unlocks, layout, mastery | Zustand `GameStore` |
| Active floor day (guests, tickets, tables) | Zustand `GameStore.floorDay` |
| Selected ticket compose draft | Zustand / floor day field |
| Modal open, scroll position | Component-local |
| Drag ghost / player tween | PixiJS scene local; goals from store |
| Flavor vectors, recipes, costs | Static `data/` — not store |
| Derived: tip preview, match preview | Selectors calling domain functions |

### Selector Pattern

```typescript
// store/selectors/economy.ts
export const selectCanAfford = (id: string) => (s: GameStore) =>
  s.cash >= getIngredientCost(s.unlockedIngredientIds.length);
```

Subscribe narrowly — kitchen screen subscribes to `unlockedIngredientIds`, not entire store.

### Actions

Actions call domain functions, then patch store:

```typescript
serveDish: (ingredientIds: string[]) => {
  const state = get();
  const result = serveCustomer(state.activeDay!, ingredientIds, state);
  set(result.nextState);
}
```

---

## 4. Game Loop & Update/Render Separation

Service days use a **ticker-driven floor** (movement, eat dwell, animations). Scoring remains event-driven on deliver.

### Modes

| Mode | Loop |
|------|------|
| Between days / menus | PixiJS ticker paused or minimal (idle bob) |
| Layout edit | Ticker on: drag ghost, snap feedback |
| Service day | Ticker on: nav, actor anims; throttled eat-dwell domain steps |

### Update/Render Split

```typescript
app.ticker.add(() => {
  scene.update(app.ticker.deltaMS); // movement + anims only
});

function syncFromStore(state: GameStore) {
  scene.syncFloor(state.floorDay, state.placements);
}
```

Do **not** put flavor/economy math in the ticker.

### Domain Stepping

Discrete events: `openDay`, set/clear table, take orders, plate/deliver ticket, purchase, placeItem. Eat dwell may advance via a throttled pure `tickEating` called from a ticker bridge.

---

## 5. Touch Input & Gestures

### Conventions

| Gesture | Context | Action |
|---------|---------|--------|
| Tap | Floor tile | Player pathfind to tile |
| Tap | Table / station / seat | Path to interact (set/clear/order/compose/deliver) |
| Drag | Furniture in edit mode | Move with grid snap |
| Tap | Ingredient chip | Toggle selection (max 6) |
| Tap | Ticket strip | Select ticket / camera hint |
| Tap | Serve / plate on compose sheet | Plate dish for carry |
| Long-press | Ingredient | Open flavor inspector popover |

### Implementation

- DOM: `pointerdown` / `pointerup`; `touch-action: manipulation`.
- PixiJS: `eventMode = 'static'`, `cursor = 'pointer'` on interactive sprites.
- **No** 300ms click delay handlers.
- Debounce double-submit on Serve (300ms lock).

### Drag-and-Drop Placement

1. `pointerdown` on furniture → start drag (local offset).
2. `pointermove` → update ghost; compute snap grid cell.
3. `pointerup` → call domain `validatePlacement()`; if valid, store action; else snap back.

---

## 6. Grid Coordinate System

### Coordinate Spaces

| Space | Origin | Units |
|-------|--------|-------|
| **Grid** | Top-left tile (0,0) | Integer tile indices |
| **World** | Top-left of canvas | Pixels (tile × 32) |
| **Screen** | Canvas element top-left | CSS pixels |

### Transforms

```typescript
const TILE_PX = 32; // 16px art × 2 scale

function gridToWorld(gx: number, gy: number): { x: number; y: number } {
  return { x: gx * TILE_PX, y: gy * TILE_PX };
}

function worldToGrid(wx: number, wy: number): { gx: number; gy: number } {
  return { gx: Math.floor(wx / TILE_PX), gy: Math.floor(wy / TILE_PX) };
}

function worldToScreen(wx: number, wy: number, camera: Camera): { x: number; y: number } {
  return { x: wx - camera.x, y: wy - camera.y };
}
```

### Snap Rules

- Placement anchor: **top-left tile** of multi-tile footprint.
- Snap on drop: `round(world / TILE_PX)` applied to the **item origin** (top-left), not the raw pointer.
- Drag snap: capture **grab offset** at `pointerdown` (`pointerWorld − gridToWorld(placement)`); on move/drop, subtract it before snapping so the tile under the item body matches the ghost.
- Tie-break at exact half-tile boundaries: `Math.round` half-up toward +infinity (e.g. origin 16→cell 1, 48→cell 2).
- Validity: in bounds, no overlap, not blocking door tile.

### Camera

- Default: centered on grid; integer pixel scroll only (no subpixel blur).
- Optional pinch-zoom **disabled for v1** — fixed scale preserves pixel crispness on iPhone 17.

---

## 7. Asset Loading & CC0 Attribution

### Loader Pipeline

```typescript
// src/assets/manifest.ts
export const ATLAS_MANIFEST = {
  tiles: '/assets/atlases/tiles.json',
  furniture: '/assets/atlases/furniture.json',
  food: '/assets/atlases/food.json',
  characters: '/assets/atlases/characters.json',
};
```

1. Boot: load UI shell (DOM) only — no atlas fetch in initial JS graph.
2. Async (dynamic import): `loadRestaurantAtlases()` via `Texture.from` + `Spritesheet.parse` for tiles/furniture/characters.
3. Lazy: DOM food icons fetch `/assets/atlases/food.json` (no Pixi); audio unlocks on first `pointerdown`.

Provenance: `public/assets/CREDITS.json` (machine-readable). Kenney CC0 sources under `vendor/kenney/sources/`; generated ingredient sprite sheets under `vendor/generated/ingredient-sheets/`. Build with `npm run build:assets` (runs `scripts/build-ingredient-icons.py` then packs atlases); CI runs `npm run audit:assets`.

Ingredient icons are purpose-made 32×32 pixel art (generated sheets → `scripts/build-ingredient-icons.py` → food atlas). UI displays them at 32 CSS px with `image-rendering: pixelated` for crisp retina rendering.

### Atlasing

- Combine Kenney sheets into TexturePacker / free alternative atlases.
- Max atlas dimension 2048×2048 for mobile GPU.
- Name sprites consistently: `table_2seat`, `stove`, `icon_chicken`.

### CC0 Provenance Requirement

**All art and audio must be CC0.** Maintain `public/assets/CREDITS.json` (generated by `npm run build:assets`) listing every shipped file. Settings → **Credits** renders from that manifest.

---

## 8. Mobile Performance Rules

**Target:** 60fps on iPhone 17 Safari; initial JS gzip ≤ Tech-Stack §3 hard cap (280k pending post-slice measure).

### Draw Calls & Textures

| Budget | Limit |
|--------|-------|
| Draw calls per frame | ≤ 50 |
| Visible sprites | ≤ 300 |
| Texture memory | ≤ 128 MB |

- Use container culling for off-screen tiles.
- Batch static floor tiles into single `ParticleContainer` or tiled sprite mesh where possible.
- Reuse `Texture` instances — never `Texture.from` per frame.

### Object Pooling

- Pool customer sprite instances (max concurrent seated + waiting ≤ seating capacity + door line buffer).
- Pool `Graphics` ghost objects for drag preview.
- Pool chat bubble DOM nodes if using DOM pool pattern.

### DOM Performance

- No layout reads in PixiJS ticker.
- Batch DOM updates via single store notification per action.
- Virtualize ingredient list if > 50 visible rows (scroll container).
- CSS `contain: layout style` on screen panels.

### Memory

- Destroy PixiJS display objects when removing furniture permanently.
- Unload unused atlases when leaving restaurant for extended settings session (optional).

---

## 9. Accessibility & Readability

| Rule | Implementation |
|------|----------------|
| Minimum font | 16px body on mobile (prevent iOS zoom-on-focus) |
| Contrast | WCAG AA for DOM text on panels |
| Touch targets | 44×44 CSS px minimum |
| Color | Do not rely on color alone for validity (use icons + text) |
| Motion | Respect `prefers-reduced-motion` — disable idle bobs |
| Screen reader | DOM screens: semantic headings, `aria-label` on icon buttons |
| Flavor bars | Text label + numeric value alongside bar |

Canvas game board has limited a11y — provide DOM alternative summaries in inspector and day summary.

---

## 10. Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Files (TS) | kebab-case | `flavor-scoring.ts` |
| React N/A | — | — |
| Classes | PascalCase | `RestaurantApp` |
| Functions | camelCase | `computeMatchStars` |
| Constants | UPPER_SNAKE | `TILE_PX`, `PRESTIGE_BASE` |
| Domain types | PascalCase | `FlavorVector` |
| Axis keys | Two-letter codes | `SW`, `UM`, `TE` |
| Asset sprites | snake_case | `icon_mushroom` |
| CSS modules | camelCase classes | `.flavorBarTrack` |
| Store actions | verbPhrase | `openDay`, `serveDish` |

---

## 11. Forbidden Patterns

**Never in production code:**

| Forbidden | Why |
|-----------|-----|
| Per-frame object allocation in ticker | GC jank on mobile |
| DOM reads (`offsetHeight`) in render loop | Layout thrash |
| Flavor/economy logic in PixiJS classes | Untestable; violates domain purity |
| `fetch()` for game logic | No network dependency |
| Non-CC0 assets | License violation |
| `100vh` without `svh` fallback | iOS address bar clip |
| `user-scalable=no` | Accessibility |
| Subpixel canvas scaling | Blurs pixel art |
| Storing full save in localStorage | Size + sync blocking |
| Mutating Zustand state outside actions | Breaks replay/debug |

---

## Cross-References

| Topic | Document |
|-------|----------|
| Formulas & product rules | [PRD.md](./PRD.md) |
| Pure domain & scoring code | [Backend-Guidelines.md](./Backend-Guidelines.md) |
| Persistence & migrations | [Backend-Guidelines.md](./Backend-Guidelines.md) |
| Implementation order | [Plan.md](./Plan.md) |
