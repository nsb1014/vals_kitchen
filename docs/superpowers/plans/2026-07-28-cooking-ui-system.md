# Cooking UI & Shared Chrome System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the UI/UX-only cooking sheet redesign and shared chrome system per `docs/superpowers/specs/2026-07-28-cooking-ui-system-design.md` — tap-to-open cook, near-full fixed layout, multi-select flavor AND filters, job-based sheet tiers — without changing gameplay mechanics.

**Architecture:** Ephemeral `composeSheetOpen` UI flag (never saved) gates the cook sheet together with existing eligibility selectors. Canvas station hit-testing in `RestaurantApp.onTapMove` opens the sheet and consumes movement. Pure presentation helpers filter the unlocked pantry by axis AND + name search. CSS sheet-tier tokens lock heights; `ServiceDayUi` and meta screens adopt fixed regions. Checkpoints C0–C5 each ship with tests and Playwright screenshots.

**Tech Stack:** TypeScript, Zustand store, vanilla DOM UI, PixiJS canvas taps, Vitest, Playwright, existing `--vk-*` CSS tokens.

**Spec:** [2026-07-28-cooking-ui-system-design.md](../specs/2026-07-28-cooking-ui-system-design.md)

## Global Constraints

- UI / player experience only — no scoring, economy, unlock, ticket, or carry rule changes.
- Do not expand which placements count as cook stations beyond today’s `prep_station` set in `interact.ts`.
- Do not use food-world categories (`protein`, `vegetable`, …) as browse model.
- No appliance filter in this plan.
- Flavor “high” = `filterIngredientsByAxis(..., 4)` (same as Flavor Inspector).
- Do not weaken tests; do not change match floors to get green.
- `npm` may be missing from PATH — run tools via `node node_modules/.bin/<tool>` (or `.npm-local/` npm).
- Branch work continues on `cursor/cook-ui-system-design-31f8` (or a follow-on `cursor/cook-ui-impl-31f8` if splitting impl from docs).

## File map

| Area | Files |
|------|--------|
| Sheet tokens | `src/ui/styles/global.css`, `service-day.css`, `screens.css` (new tier classes) |
| Compose flag | `src/store/game-store.ts`, `src/store/selectors/service-day.ts`, `src/store/index.ts` |
| Station tap | `src/domain/floor/interact.ts`, `src/canvas/RestaurantApp.ts` |
| Pantry filter | **Create** `src/ui/presentation/compose-pantry.ts` + `src/test/ui/compose-pantry.test.ts` |
| Cook UI | `src/ui/components/ServiceDayUi.ts` |
| Compact/mid overlays | `ServiceDayUi.ts`, `LayoutToolbar.ts`, ceremony/review markup + CSS |
| Meta tabs | `ShopScreen.ts`, `FlavorInspectorScreen.ts`, `RecipeBookScreen.ts`, `RatingScreen.ts`, `SettingsScreen.ts`, `screens.css` |
| Tests | `src/test/store/compose-sheet.test.ts`, `src/test/floor/interactions.test.ts`, `src/test/ui/*`, `tests/e2e/cook-ui-chrome.spec.ts` |

---

### Task 1: C0 — Sheet tier CSS tokens

**Files:**
- Modify: `src/ui/styles/global.css`
- Modify: `src/ui/styles/service-day.css`
- Modify: `src/ui/styles/screens.css`
- Test: gate visually in Task 8 Playwright screenshots.

**Interfaces:**
- Produces: CSS classes `.sheet-tier-compact`, `.sheet-tier-mid`, `.sheet-tier-near-full`, `.sheet-header`, `.sheet-footer`, `.sheet-body-scroll`; CSS vars `--vk-sheet-compact-h`, `--vk-sheet-mid-h`, `--vk-sheet-near-h`, `--vk-chip-h`, `--vk-row-h`, `--vk-cta-h`.

- [ ] **Step 1: Add size tokens to `:root` in `global.css`**

```css
:root {
  /* …existing --vk-* … */
  --vk-sheet-compact-h: 38%;
  --vk-sheet-mid-h: 50%;
  --vk-sheet-near-h: 88%;
  --vk-chip-h: 44px;
  --vk-row-h: 56px;
  --vk-cta-h: 48px;
  --vk-sheet-header-h: 3.25rem;
  --vk-sheet-footer-min-h: 7.5rem;
}
```

- [ ] **Step 2: Add tier + region classes in `service-day.css`**

Replace content-driven `.service-panel { max-height: 55%; overflow: auto; }` growth with locked shells:

```css
.service-panel.sheet-tier-compact {
  flex: 0 0 auto;
  height: var(--vk-sheet-compact-h);
  max-height: var(--vk-sheet-compact-h);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.service-panel.sheet-tier-mid {
  height: var(--vk-sheet-mid-h);
  max-height: var(--vk-sheet-mid-h);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.service-panel.sheet-tier-near-full {
  height: var(--vk-sheet-near-h);
  max-height: var(--vk-sheet-near-h);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sheet-header,
.sheet-footer {
  flex: 0 0 auto;
}

.sheet-body-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.ingredient-chip,
.filter-axis-chip {
  height: var(--vk-chip-h);
  min-height: var(--vk-chip-h);
  max-height: var(--vk-chip-h);
}

.sheet-footer .service-btn.primary,
#plate-btn {
  height: var(--vk-cta-h);
  min-height: var(--vk-cta-h);
}
```

Keep existing colors; do not redesign tokens beyond sizing.

- [ ] **Step 3: Meta-full row height in `screens.css`**

```css
.shop-item,
.recipe-row,
.inspector-list-item {
  min-height: var(--vk-row-h);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/styles/global.css src/ui/styles/service-day.css src/ui/styles/screens.css
git commit -m "style: add locked sheet tier and control size tokens"
```

---

### Task 2: C1 — `composeSheetOpen` store lifecycle + selector

**Files:**
- Modify: `src/store/game-store.ts`
- Modify: `src/store/selectors/service-day.ts`
- Modify: `src/store/index.ts` (re-exports if needed)
- Create: `src/test/store/compose-sheet.test.ts`

**Interfaces:**
- Produces:
  - `composeSheetOpen: boolean` on `GameStore` (UI meta only)
  - `openComposeSheet(): void` — sets true only when `selectCanOpenFloorCompose(get())`
  - `closeComposeSheet(): void` — sets false; does **not** clear `composeDraftIngredientIds`
  - `selectCanOpenFloorCompose(state): boolean` — adjacency + open ticket + day guards (no open flag)
  - `selectShowFloorCompose(state): boolean` — `composeSheetOpen && selectCanOpenFloorCompose(state)`
- Consumes: existing `selectFloorComposeTicket`, `playerNearStation`, `selectFloorPlayerGrid`

- [ ] **Step 1: Write failing tests in `src/test/store/compose-sheet.test.ts`**

Use floor setup patterns from `src/test/floor/vertical-slice.test.ts` and `service-day-resume.test.ts` so the store has an open day, open ticket, and player adjacent to `prep_station`.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../../store/game-store.ts';
import {
  selectCanOpenFloorCompose,
  selectShowFloorCompose,
} from '../../store/selectors/service-day.ts';

describe('composeSheetOpen', () => {
  beforeEach(async () => {
    // hydrate fresh game + open floor day with open ticket;
    // place player adjacent to prep_station via setFloorNavPosition
  });

  it('does not show compose on adjacency alone', () => {
    useGameStore.setState({ composeSheetOpen: false });
    expect(selectCanOpenFloorCompose(useGameStore.getState())).toBe(true);
    expect(selectShowFloorCompose(useGameStore.getState())).toBe(false);
  });

  it('shows compose only after openComposeSheet when eligible', () => {
    useGameStore.getState().openComposeSheet();
    expect(useGameStore.getState().composeSheetOpen).toBe(true);
    expect(selectShowFloorCompose(useGameStore.getState())).toBe(true);
  });

  it('openComposeSheet is a no-op when ineligible', () => {
    useGameStore.setState({ floorPlayerGrid: { x: 0, y: 0 } });
    useGameStore.getState().openComposeSheet();
    expect(useGameStore.getState().composeSheetOpen).toBe(false);
  });

  it('closeComposeSheet clears flag but keeps draft', async () => {
    await useGameStore.getState().dispatch({
      type: 'SET_COMPOSE_DRAFT',
      ingredientIds: ['flour', 'salt', 'butter'],
    });
    useGameStore.getState().openComposeSheet();
    useGameStore.getState().closeComposeSheet();
    expect(useGameStore.getState().composeSheetOpen).toBe(false);
    expect(useGameStore.getState().composeDraftIngredientIds).toEqual([
      'flour',
      'salt',
      'butter',
    ]);
  });

  it('clears composeSheetOpen when leaving adjacency without stale reopen', () => {
    useGameStore.getState().openComposeSheet();
    useGameStore.getState().setFloorNavPosition(0, 0);
    expect(useGameStore.getState().composeSheetOpen).toBe(false);
    // move back adjacent without calling openComposeSheet
    expect(selectShowFloorCompose(useGameStore.getState())).toBe(false);
  });

  it('clears on FLOOR_PLATE, pendingReview, CLOSE_DAY, hydrate, import, navigateTo', async () => {
    // split into focused assertions per clear site if clearer
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node node_modules/.bin/vitest run src/test/store/compose-sheet.test.ts
```

Expected: FAIL (`composeSheetOpen` / `openComposeSheet` missing, or `selectShowFloorCompose` still adjacency-only).

- [ ] **Step 3: Implement store flag + methods**

In `game-store.ts`:

- Add `composeSheetOpen: boolean` (default `false`) to store type and initial state.
- Add to UI-meta reset lists: `hydrate`, `importSaveCode`, `OPEN_DAY`, `CLOSE_DAY`, `FLOOR_PLATE`, pending-review paths, `navigateTo`.
- **Do not** include in `pickGameState` / save payload / RS1.
- Implement:

```ts
openComposeSheet() {
  const state = get();
  if (!selectCanOpenFloorCompose(state)) return;
  set({ composeSheetOpen: true });
},
closeComposeSheet() {
  set({ composeSheetOpen: false });
},
```

- In `setFloorNavPosition` (or helper it calls): if `composeSheetOpen && !selectCanOpenFloorCompose(get())` then clear the flag.
- Mirror clears on room change (`enterConnectingDoor`) and when ticket selection leaves no cookable ticket.

- [ ] **Step 4: Split selectors in `service-day.ts`**

```ts
export function selectCanOpenFloorCompose(state: GameStore): boolean {
  if (!state.activeDay?.floor || state.pendingReview || !state.modifierDismissed) {
    return false;
  }
  if (state.daySummary || state.ceremony) return false;
  const player = selectFloorPlayerGrid(state);
  const roomPlacements =
    state.activeFloorRoom === 'back_kitchen'
      ? state.backKitchenPlacements
      : state.placements;
  if (!player || !playerNearStation(player, roomPlacements)) return false;
  return selectFloorComposeTicket(state) !== null;
}

export function selectShowFloorCompose(state: GameStore): boolean {
  return Boolean(state.composeSheetOpen) && selectCanOpenFloorCompose(state);
}
```

**Forbidden:** relying on a stale `true` flag without actively clearing when eligibility drops.

- [ ] **Step 5: Run tests — expect PASS**

```bash
node node_modules/.bin/vitest run src/test/store/compose-sheet.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/store/game-store.ts src/store/selectors/service-day.ts src/store/index.ts src/test/store/compose-sheet.test.ts
git commit -m "feat: composeSheetOpen UI flag with explicit lifecycle clears"
```

---

### Task 3: C1 — Station tap hit-testing

**Files:**
- Modify: `src/domain/floor/interact.ts`
- Modify: `src/domain/floor/index.ts`
- Modify: `src/canvas/RestaurantApp.ts`
- Modify: `src/test/floor/interactions.test.ts`

**Interfaces:**
- Produces:
  - `isCookStationItemKey(itemKey: string): boolean`
  - `findCookStationPlacementAtCell(placements: Placement[], cell: GridPoint, footprint?: number): Placement | null`
- Consumes: `openComposeSheet`, `selectCanOpenFloorCompose`, `setFloorToast`, existing pathfinding

- [ ] **Step 1: Failing tests in `interactions.test.ts`**

```ts
describe('findCookStationPlacementAtCell', () => {
  it('returns prep_station placement when tapping its cell', () => {
    const placements = [
      { id: 'station_prep', itemKey: 'prep_station', x: 8, y: 2, rotation: 0 },
    ];
    expect(findCookStationPlacementAtCell(placements, { x: 8, y: 2 })?.id).toBe(
      'station_prep',
    );
    expect(findCookStationPlacementAtCell(placements, { x: 0, y: 0 })).toBeNull();
  });

  it('does not treat tables as cook stations', () => {
    const placements = [
      { id: 't1', itemKey: 'table_2seat', x: 3, y: 3, rotation: 0 },
    ];
    expect(findCookStationPlacementAtCell(placements, { x: 3, y: 3 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node node_modules/.bin/vitest run src/test/floor/interactions.test.ts
```

- [ ] **Step 3: Export helpers from `interact.ts`**

Keep `STATION_ITEM_KEYS` as the single source of truth (still only `prep_station`). Export:

```ts
export function isCookStationItemKey(itemKey: string): boolean {
  return STATION_ITEM_KEYS.has(itemKey);
}

export function findCookStationPlacementAtCell(
  placements: Placement[],
  cell: GridPoint,
  footprint = 1,
): Placement | null {
  for (const p of placements) {
    if (!isCookStationItemKey(p.itemKey)) continue;
    for (let dy = 0; dy < footprint; dy++) {
      for (let dx = 0; dx < footprint; dx++) {
        if (p.x + dx === cell.x && p.y + dy === cell.y) return p;
      }
    }
  }
  return null;
}
```

Re-export from `src/domain/floor/index.ts`.

- [ ] **Step 4: Wire `onTapMove` priority**

In `RestaurantApp.onTapMove`, after edit/day guards and alongside deliver/door branches, **before** pathfinding:

```ts
const roomPlacements = this.roomPlacements(store);
const station = findCookStationPlacementAtCell(roomPlacements, tapCell);
if (station) {
  if (store.composeSheetOpen) {
    store.closeComposeSheet();
    return; // same-event close wins; do not reopen
  }
  if (selectCanOpenFloorCompose(store)) {
    store.openComposeSheet();
    return; // consume movement
  }
  const player =
    store.floorPlayerGrid ?? store.activeDay?.floor?.playerPosition ?? null;
  if (!player || !playerNearStation(player, roomPlacements)) {
    store.setFloorToast('Move next to the station to cook');
    return;
  }
  store.setFloorToast('No open ticket to cook');
  return;
}

if (store.composeSheetOpen) {
  store.closeComposeSheet();
  // fall through to normal movement / deliver / door handling
}
```

Locked toast copy:
- `Move next to the station to cook`
- `No open ticket to cook`

- [ ] **Step 5: Run interaction + compose-sheet tests — PASS**

```bash
node node_modules/.bin/vitest run src/test/floor/interactions.test.ts src/test/store/compose-sheet.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/domain/floor/interact.ts src/domain/floor/index.ts src/canvas/RestaurantApp.ts src/test/floor/interactions.test.ts
git commit -m "feat: tap cook station to open compose sheet"
```

---

### Task 4: C2 — Compose pantry filter helpers (AND + search)

**Files:**
- Create: `src/ui/presentation/compose-pantry.ts`
- Create: `src/test/ui/compose-pantry.test.ts`

**Interfaces:**
- Consumes: `filterIngredientsByAxis` from `flavor-profile.ts`, `AXIS_LABELS`, `Ingredient`, `AxisKey`
- Produces:

```ts
export const COMPOSE_AXIS_HIGH_MIN = 4;

export interface ComposePantryFilterState {
  selectedAxes: AxisKey[]; // empty = All
  nameQuery: string;
}

export function emptyComposePantryFilters(): ComposePantryFilterState;
export function toggleComposeAxis(
  state: ComposePantryFilterState,
  axis: AxisKey,
): ComposePantryFilterState;
export function clearComposeAxes(state: ComposePantryFilterState): ComposePantryFilterState;
export function setComposeNameQuery(
  state: ComposePantryFilterState,
  query: string,
): ComposePantryFilterState;
export function clearComposeNameQuery(
  state: ComposePantryFilterState,
): ComposePantryFilterState;
export function filterComposePantry(
  unlocked: Ingredient[],
  filters: ComposePantryFilterState,
): Ingredient[];
export function composePantrySummary(
  filters: ComposePantryFilterState,
  matchCount: number,
): string;
```

- [ ] **Step 1: Write failing tests in `src/test/ui/compose-pantry.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { emptyFlavorProfile } from '../../domain/flavor/axis-labels.ts';
import type { Ingredient } from '../../domain/types.ts';
import {
  clearComposeNameQuery,
  composePantrySummary,
  emptyComposePantryFilters,
  filterComposePantry,
  setComposeNameQuery,
  toggleComposeAxis,
} from '../../ui/presentation/compose-pantry.ts';

function ing(
  id: string,
  name: string,
  flavorPatch: Partial<Ingredient['flavor']>,
): Ingredient {
  return {
    id,
    name,
    category: 'test',
    equipmentId: 'prep_station',
    compoundIds: [],
    purchaseIndex: 0,
    flavor: { ...emptyFlavorProfile(), ...flavorPatch },
  };
}

describe('filterComposePantry', () => {
  const pantry = [
    ing('a', 'Alpha Stock', { UM: 8, HT: 7 }),
    ing('b', 'Beta Oil', { UM: 8, HT: 0 }),
    ing('c', 'Chili Flake', { UM: 0, HT: 9 }),
  ];

  it('ANDs high axes', () => {
    let f = emptyComposePantryFilters();
    f = toggleComposeAxis(f, 'UM');
    f = toggleComposeAxis(f, 'HT');
    expect(filterComposePantry(pantry, f).map((i) => i.id)).toEqual(['a']);
  });

  it('name search is case-insensitive and trimmed', () => {
    const f = setComposeNameQuery(emptyComposePantryFilters(), '  oil ');
    expect(filterComposePantry(pantry, f).map((i) => i.id)).toEqual(['b']);
  });

  it('clearComposeNameQuery restores full list under axes', () => {
    let f = setComposeNameQuery(emptyComposePantryFilters(), 'oil');
    f = clearComposeNameQuery(f);
    expect(filterComposePantry(pantry, f)).toHaveLength(3);
  });

  it('summary includes count and axes', () => {
    const f = toggleComposeAxis(emptyComposePantryFilters(), 'UM');
    const text = composePantrySummary(f, 2);
    expect(text).toMatch(/2 matching/);
    expect(text).toMatch(/Umami/);
  });
});
```

- [ ] **Step 2: Run — FAIL**

```bash
node node_modules/.bin/vitest run src/test/ui/compose-pantry.test.ts
```

- [ ] **Step 3: Implement `compose-pantry.ts`**

```ts
import { AXIS_LABELS } from '../../domain/flavor/axis-labels.ts';
import type { AxisKey, Ingredient } from '../../domain/types.ts';
import { filterIngredientsByAxis } from './flavor-profile.ts';

export const COMPOSE_AXIS_HIGH_MIN = 4;

export interface ComposePantryFilterState {
  selectedAxes: AxisKey[];
  nameQuery: string;
}

export function emptyComposePantryFilters(): ComposePantryFilterState {
  return { selectedAxes: [], nameQuery: '' };
}

export function toggleComposeAxis(
  state: ComposePantryFilterState,
  axis: AxisKey,
): ComposePantryFilterState {
  const has = state.selectedAxes.includes(axis);
  return {
    ...state,
    selectedAxes: has
      ? state.selectedAxes.filter((a) => a !== axis)
      : [...state.selectedAxes, axis],
  };
}

export function clearComposeAxes(state: ComposePantryFilterState): ComposePantryFilterState {
  return { ...state, selectedAxes: [] };
}

export function setComposeNameQuery(
  state: ComposePantryFilterState,
  query: string,
): ComposePantryFilterState {
  return { ...state, nameQuery: query };
}

export function clearComposeNameQuery(
  state: ComposePantryFilterState,
): ComposePantryFilterState {
  return { ...state, nameQuery: '' };
}

export function filterComposePantry(
  unlocked: Ingredient[],
  filters: ComposePantryFilterState,
): Ingredient[] {
  let list = unlocked;
  for (const axis of filters.selectedAxes) {
    list = filterIngredientsByAxis(list, axis, COMPOSE_AXIS_HIGH_MIN);
  }
  const q = filters.nameQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((item) => item.name.toLowerCase().includes(q));
  }
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

export function composePantrySummary(
  filters: ComposePantryFilterState,
  matchCount: number,
): string {
  const count = `${matchCount} matching`;
  if (filters.selectedAxes.length === 0) return count;
  const axes = filters.selectedAxes.map((a) => AXIS_LABELS[a]).join(' + ');
  return `${count} · ${axes}`;
}
```

- [ ] **Step 4: Run — PASS; commit**

```bash
node node_modules/.bin/vitest run src/test/ui/compose-pantry.test.ts
git add src/ui/presentation/compose-pantry.ts src/test/ui/compose-pantry.test.ts
git commit -m "feat: compose pantry AND axis filter and name search helpers"
```

---

### Task 5: C2 — Near-full cook sheet UI

**Files:**
- Modify: `src/ui/components/ServiceDayUi.ts`
- Modify: `src/ui/styles/service-day.css`
- Create: `src/test/ui/floor-compose-sheet.test.ts` (and/or extend `phase6-screens.test.ts`)

**Interfaces:**
- Consumes: `selectShowFloorCompose`, `closeComposeSheet`, `filterComposePantry`, `AXIS_KEYS`, `AXIS_LABELS`, dish preview / plate dispatch
- Filter state: **module-local in the mount closure** — reset when sheet closes, ticket id changes, or day tears down; never persist

- [ ] **Step 1: Failing UI test**

Assert cook markup includes `data-testid="compose-sheet"`, `compose-close`, search input, axis chips, filter summary, pinned `#plate-btn`, and that adjacency alone does not mount it when `composeSheetOpen` is false.

- [ ] **Step 2: Rewrite floor compose branch in `renderServiceOverlay`**

```html
<div class="service-panel sheet-tier-near-full" data-testid="compose-sheet" role="dialog" aria-modal="true" aria-labelledby="compose-title">
  <div class="service-card compose-sheet-card">
    <header class="sheet-header">
      <h2 id="compose-title" class="service-title">Plate Dish</h2>
      <button type="button" class="icon-btn" data-testid="compose-close" aria-label="Close">✕</button>
    </header>
    <!-- ticket badge + selected strip (fixed) -->
    <!-- axis chips + search + clear + summary (fixed) -->
    <div class="sheet-body-scroll ingredient-grid" role="group" aria-label="Unlocked ingredients">
      <!-- filtered chips; aria-label = full ingredient name -->
    </div>
    <footer class="sheet-footer">
      <!-- flavor bars without numbers -->
      <button id="plate-btn" data-testid="plate-btn" …>Plate</button>
    </footer>
  </div>
</div>
```

Wire:
- Close → `closeComposeSheet()`
- Escape closes cook when it is top layer (inspector modal, if open, still wins)
- Axis chip click → `toggleComposeAxis` + re-render pantry (keep draft)
- Search → `setComposeNameQuery`; clear button → `clearComposeNameQuery`
- Long-press: cancel on pantry `scroll` / pointer cancel
- `pointerdown` on sheet calls `stopPropagation` so canvas does not receive it

- [ ] **Step 3: Reset local filters** when `selectShowFloorCompose` goes true→false, when `selectFloorComposeTicket` id changes, on day summary/close.

- [ ] **Step 4: Run UI + pantry + compose-sheet tests — PASS; commit**

```bash
node node_modules/.bin/vitest run src/test/ui/compose-pantry.test.ts src/test/store/compose-sheet.test.ts src/test/phase6-screens.test.ts src/test/ui/floor-compose-sheet.test.ts
git add src/ui/components/ServiceDayUi.ts src/ui/styles/service-day.css src/test/ui/floor-compose-sheet.test.ts
git commit -m "feat: near-full cook sheet with flavor filters and close controls"
```

---

### Task 6: C3 — Compact / mid service overlays

**Files:**
- Modify: `src/ui/components/ServiceDayUi.ts` (open for service, review, day summary, ceremony)
- Modify: `src/ui/components/LayoutToolbar.ts` (edit tools strip)
- Modify: `src/ui/styles/service-day.css`
- Test: extend existing open-for-service / day-summary UI tests with tier class assertions

**Interfaces:**
- Open for service → `sheet-tier-compact`
- Review → `sheet-tier-mid`
- Day summary → `sheet-tier-near-full` with `.sheet-body-scroll` + fixed footer (Back to floor / Visit shop only — **no ✕**)
- Ceremony → keep centered `.modal-card` (compact modal)
- Layout edit hint bar → compact height, not a catalog sheet

- [ ] **Step 1: Failing tests** asserting open-for-service uses `sheet-tier-compact` (not near-full).

- [ ] **Step 2: Apply tier classes + fixed footer pattern** without changing button handlers or copy semantics.

- [ ] **Step 3: Run related UI tests — PASS; commit**

```bash
git commit -m "style: apply job-based sheet tiers to service overlays"
```

---

### Task 7: C4 — Meta-full tab chrome pass

**Files:**
- Modify: `src/ui/screens/ShopScreen.ts`, `FlavorInspectorScreen.ts`, `RecipeBookScreen.ts`, `RatingScreen.ts`, `SettingsScreen.ts`
- Modify: `src/ui/styles/screens.css`
- Test: existing shop/recipe/rating/settings tests must stay green

**Rules:**
- No new shop goods; no purchase logic changes.
- Shop optional jump chips = `scrollIntoView` on existing section headings only.
- Flavors: keep axis `<select>`; optional name search sugar is skippable (cook search already required).
- Recipes: keep existing search + tabs.
- Fixed `min-height: var(--vk-row-h)` on list rows; ellipsis + full accessible name.
- Do not change navigation lock behavior.

- [ ] **Step 1: Apply layout tokens + ellipsis; keep handlers**

- [ ] **Step 2: Run**

```bash
node node_modules/.bin/vitest run src/test/ui/shop-items.test.ts src/test/ui/recipe-book.test.ts src/test/phase6-screens.test.ts
```

- [ ] **Step 3: Commit**

```bash
git commit -m "style: meta-tab chrome pass with fixed row heights"
```

---

### Task 8: C5 — Affordance, stacking, Playwright screenshots

**Files:**
- Modify: `src/canvas/RestaurantApp.ts` (`computeStationHints` — stronger highlight only when `selectCanOpenFloorCompose`)
- Modify: `src/ui/components/FloorServiceHud.ts` / CSS — tickets vs compose stacking (`pointer-events`, z-index); no click-through
- Create: `tests/e2e/cook-ui-chrome.spec.ts`
- Modify: `docs/Progress.md` — note cook UI implementation status
- Modify: `docs/superpowers/specs/2026-07-28-cooking-ui-system-design.md` — Status → Approved; link this plan

**Interfaces:**
- E2E uses `/?e2e=1` helpers from `tests/e2e/helpers.ts` and existing e2e bridge where available

- [ ] **Step 1: Full unit/typecheck gate**

```bash
node node_modules/.bin/vitest run
node node_modules/.bin/tsc --noEmit
```

Expected: PASS (no weakened scoring tests).

- [ ] **Step 2: Add `tests/e2e/cook-ui-chrome.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { gotoFreshGame } from './helpers';

test.describe('cook UI chrome', () => {
  for (const width of [320, 360, 390]) {
    test(`compose sheet layout ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 720 });
      await gotoFreshGame(page);
      // Drive: open day → seat → take order → stand adjacent → tap station
      // Prefer real canvas tap; use e2e bridge only for setup already supported
      await expect(page.getByTestId('compose-sheet')).toBeVisible();
      await expect(page.getByTestId('plate-btn')).toBeVisible();
      await page.screenshot({
        path: `test-results/cook-ui-${width}.png`,
        fullPage: true,
      });
      await page.getByTestId('compose-close').click();
      await expect(page.getByTestId('compose-sheet')).toHaveCount(0);
    });
  }

  test('open for service stays compact', async ({ page }) => {
    await gotoFreshGame(page);
    await expect(page.locator('.sheet-tier-compact')).toBeVisible();
    await page.screenshot({ path: 'test-results/open-service-compact.png' });
  });
});
```

If Playwright Chromium cannot install in the sandbox, leave the spec committed, report the environment blocker, and keep unit coverage green — do not fake a pass.

- [ ] **Step 3: Run e2e when browsers available**

```bash
node node_modules/.bin/playwright test tests/e2e/cook-ui-chrome.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/canvas/RestaurantApp.ts src/ui/components/FloorServiceHud.ts src/ui/styles/service-day.css tests/e2e/cook-ui-chrome.spec.ts docs/Progress.md docs/superpowers/specs/2026-07-28-cooking-ui-system-design.md
git commit -m "test: cook UI chrome e2e screenshots and station affordance polish"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Locked sheet tiers / no text-driven height | 1, 6, 7 |
| Tap station open; no adjacency auto-open | 2, 3 |
| `composeSheetOpen` full clear list / no stale reopen | 2 |
| Ineligible station toast + no path onto station | 3 |
| Floor-peek dismiss + move; no overlay click-through | 3, 5, 8 |
| AND multi-select high axes (≥4) | 4, 5 |
| Name search trim/case + clear + summary | 4, 5 |
| Ephemeral filters; preserved draft | 2, 5 |
| Near-full cook fixed regions + pinned Plate | 5 |
| Compact open-for-service / mid review / near summary | 6 |
| Meta tabs chrome only | 7 |
| Responsive + a11y cases | 5, 8 |
| Checkpoint screenshots / tests | 8 (+ unit tests per task) |
| No mechanic / station-set expansion | Global + Task 3 |

## Locked constants

| Item | Value |
|------|-------|
| Toast (not adjacent) | `Move next to the station to cook` |
| Toast (no ticket) | `No open ticket to cook` |
| High axis min | `4` (`COMPOSE_AXIS_HIGH_MIN`) |
| Store flag | `composeSheetOpen` / `openComposeSheet` / `closeComposeSheet` |
| Day summary ✕ | Not required |
| Appliance filter | Out of scope |
