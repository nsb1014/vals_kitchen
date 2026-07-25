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
│   ├── layers/             # Background, grid, furniture, entities
│   ├── systems/            # GridRenderer, DragPlacement, Camera
│   └── input/              # Pointer → grid mapping
├── ui/                     # DOM overlay screens
│   ├── components/         # Buttons, modals, flavor bars
│   ├── screens/            # Kitchen, Shop, Settings, etc.
│   └── styles/             # CSS Modules (*.module.css)
├── domain/                 # Pure game logic (NO Pixi/DOM imports)
│   ├── flavor/
│   ├── economy/
│   ├── rating/
│   ├── day/
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
| Restaurant floor grid rendering | Pixel art tiles, 60fps pan/zoom |
| Furniture/equipment sprites | Drag with snap preview |
| Customer queue avatars (optional) | Animated sprites in world space |
| Placement ghost / validity tint | GPU-friendly Graphics |
| World-space particle effects (serve flash) | Optional polish |

### DOM Overlay Owns

| Concern | Rationale |
|---------|-----------|
| All text (chat bubbles may be DOM for i18n/wrap) | Crisp text, accessibility |
| Kitchen ingredient picker | Scroll lists, 44px touch targets |
| Flavor profile inspector (bars, labels) | HTML/CSS layout |
| Shop, upgrades, rating, recipe book | Form-like UI |
| Modals, settings, Save Code input | Native input elements |
| Day summary, prestige ceremony | Rich typography |

### Chat Bubble Exception

Customer preference bubbles may render as **DOM elements positioned over canvas** (recommended for text wrapping and Dynamic Island safe area) OR as PixiJS BitmapText for pure canvas — default **DOM overlay anchored to customer sprite screen position**.

### Communication Pattern

```
User tap (DOM or Pixi)
  → store action (Zustand)
    → domain reducer (pure)
      → store patch
        → DOM components re-render (selectors)
        → canvas scene sync (subscribe: layout, queue index only)
```

Canvas **never** computes flavor scores or economy — it reflects store state.

---

## 3. State Management (Zustand)

### Store Shape (Conceptual)

```typescript
interface GameStore {
  // Meta
  day: number;
  cash: number;
  prestige: number;
  rating: number;

  // Progress
  unlockedIngredientIds: string[];
  purchasedUpgradeIds: string[];
  discoveredRecipeIds: string[];
  gridSize: { w: number; h: number };
  seatingCapacity: number;

  // Layout
  placements: Placement[];  // { id, itemKey, x, y, rotation }

  // Active day (null between days)
  activeDay: ActiveDay | null;

  // UI chrome (transient)
  screen: ScreenId;
  editLayoutMode: boolean;
}

interface ActiveDay {
  seed: number;
  modifierId: string;
  customers: Customer[];
  queueIndex: number;
  dayEarnings: number;
}
```

### What Belongs Where

| State | Location |
|-------|----------|
| Cash, rating, unlocks, layout | Zustand `GameStore` |
| Active day queue, current customer | Zustand `GameStore.activeDay` |
| Selected ingredients for current dish | Zustand slice or `ComposeStore` |
| Modal open, scroll position, hover | Component-local |
| Drag ghost position (during drag) | PixiJS scene local; commit to store on drop |
| Flavor vectors, recipes, costs | Static `data/` — not store |
| Derived: tip preview, match preview | `useMemo` selectors calling domain functions |

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

This is a **tap-paced** game — no continuous simulation required. Still use a structured loop for canvas polish.

### Modes

| Mode | Loop |
|------|------|
| Between days / menus | PixiJS ticker paused or minimal (idle animation only) |
| Layout edit | Ticker on: drag ghost, snap feedback |
| Service day | Event-driven updates; ticker for customer idle bob |

### Update/Render Split

```typescript
// canvas/RestaurantApp.ts
app.ticker.add(() => {
  scene.update(app.ticker.deltaMS);  // animations only
  // NO domain logic here
});

function syncFromStore(state: GameStore) {
  gridLayer.sync(state.placements, state.gridSize);
  entityLayer.syncQueue(state.activeDay?.queueIndex ?? -1);
}
```

Store subscription triggers `syncFromStore` — not every ticker frame.

### Domain Stepping

Domain advances **only on discrete events:**

- `openDay()`, `serveDish()`, `nextCustomer()`, `closeDay()`, `purchase()`, `placeItem()`

---

## 5. Touch Input & Gestures

### Conventions

| Gesture | Context | Action |
|---------|---------|--------|
| Tap | Tile / furniture | Select; open context if edit mode |
| Drag | Furniture in edit mode | Move with grid snap |
| Tap | Ingredient chip | Toggle selection (max 6) |
| Tap | Serve button | Submit dish |
| Tap | Next Customer | Advance queue |
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

**Target:** 60fps on iPhone 17 Safari; ≤ 190 KB gzip initial JS per [Tech-Stack.md](./Tech-Stack.md).

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

- Pool customer sprite instances (max queue size ≤ 15).
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
