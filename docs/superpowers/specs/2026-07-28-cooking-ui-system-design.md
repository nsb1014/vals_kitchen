# Cooking UI & Shared Chrome System — Design

**Date:** 2026-07-28  
**Status:** Approved  
**Implementation plan:** [../plans/2026-07-28-cooking-ui-system.md](../plans/2026-07-28-cooking-ui-system.md)  
**Product:** Restaurant Simulator (`vals_kitchen`)  
**Scope:** UI / player experience only — no gameplay or economy mechanic changes

## 1. Goal

Make cooking usable at ~100 unlocked ingredients and make station open/close feel intentional, while applying a consistent chrome system across existing screens. Sheet **height follows the job** (decision vs work vs meta), using **locked size tokens** so controls do not reflow with copy length.

## 2. Locked decisions

| Topic | Decision |
|-------|----------|
| Overall approach | Full chrome pass (Option 3), applied logically by screen job |
| Cook layout | Near-full sheet (~85–90%) with thin floor peek (Option B) |
| Sheet sizing | Locked tiers — not content-driven `height: auto` from text |
| Cook open | Tap cook station while adjacent + open ticket available (no walk-up auto-open) |
| Cook close | ✕, Escape, outside-tap / floor-peek tap, leave adjacency, and explicit invalidation list (§5.1 / §7.2) |
| Floor-peek tap | Dismisses sheet **and** continues normal canvas tap handling (movement) |
| Overlay hit-testing | Cook, Tickets, and ingredient inspector **never** click through to move the player |
| Cook browse | Multi-select **flavor axis** chips; **AND** filter; “high” on each selected axis |
| High threshold | Reuse existing Flavors helper (`filterIngredientsByAxis` with min **4**, same as inspector) |
| Filters vs draft | Filters are ephemeral UI; dish draft is preserved (§5.5) |
| Appliance filter | **Not in this design** (deferred) |
| Food-world categories | **Not used** (no protein/veg/spice browse model) |
| Name search on cook | Yes — case-insensitive trimmed name substring; clear control; result summary |
| Mechanics | Unchanged: 3–6 ingredients, scoring, unlocks, tickets max 4, one carry, equipment purchase gates, etc. |
| New screens / tabs / content | None |

## 3. Hard fence (non-goals)

**Do not change**

- Scoring, tips, rating, prestige, soft reset, mastery formulas
- Dish ingredient count rules, ticket queue limits, carry rules
- Unlock costs, equipment purchase gates, ingredient corpus
- Per-station ingredient gating at cook time (unlock remains the gate)
- Which placements currently count as cook stations (do not expand station set as a “feature”)
- New shop goods, achievements, recipes, or data fields

**Do not invent**

- Reality-based pantry taxonomies as the primary browse model
- New gameplay systems (stock, timers, cook mini-games)
- Promoting simple decision UIs into near-full sheets “for consistency”

## 4. Size token system

### 4.1 Sheet tiers (viewport height)

| Token | Approx. height | Use when |
|-------|----------------|----------|
| `compact` | ~30–40% (or fixed card max-height) | Few actions / short copy |
| `mid` | ~45–55% | Read feedback + one primary CTA |
| `near-full` | ~85–90% | Browse + compose / multi-block results over floor |
| `meta-full` | 100% panel under status, above bottom nav | Tab screens (no floor peek) |
| `floating` | Fixed max-height panel | Tickets over floor |

Exact `%` / `rem` values are implementation details; **each tier is a locked shell**. Content scrolls **inside** the shell. Shell height does not grow with string length.

### 4.2 Control tokens

| Token | Rule |
|-------|------|
| Touch target | Min **44×44px** |
| Chip height | Fixed |
| List / shop / recipe row height | Fixed |
| Primary CTA height | Fixed |
| Sheet header / footer | Fixed heights |
| Long labels | Ellipsis truncate visually — accessible name remains full (§8) |

### 4.3 Visual tokens

Keep the existing warm diner palette (`--vk-*`): deep browns, gold accent, sage action/selected. This is a **layout and interaction** pass, not a rebrand. Prefer simplicity: one radius scale, one chip style, one primary button style.

## 5. Cook sheet

### 5.1 Open / close and station tap

**Open when all are true**

1. Service day floor active (existing compose eligibility; no pending review / ceremony blocking)
2. Player’s **current** grid position is adjacent to a cook-station placement (existing adjacency; not “tap cell is adjacent”)
3. An open ticket is available to cook (existing ticket selection rules)
4. Pointer hit-tests to that station’s placement footprint
5. Open succeeds → set `composeSheetOpen = true` and **consume** the movement action (do not pathfind)

**Ineligible station tap** (hit is a cook station, but adjacency or ticket eligibility fails)

- Show a short `floorToast` explaining why (e.g. need to stand next to the station, or no open ticket)
- Do **not** open the sheet
- Do **not** pathfind onto the blocked station cell
- Deterministic: never silently ignore a clear station hit

**Non-station canvas taps** keep today’s movement / deliver / door behavior.

**Close / clear `composeSheetOpen` when any of**

- ✕ tapped
- Escape (when cook sheet is the top dialog)
- Floor-peek / outside canvas tap (§5.1.1)
- Player leaves station adjacency
- Room transition (main ↔ back kitchen)
- Selected / open ticket becomes invalid (no cookable ticket)
- Successful `FLOOR_PLATE`
- `pendingReview` appears
- Day close / teardown / day summary
- Save hydration / Save Code import
- Navigation away from the restaurant floor screen

**Draft behavior**

- No new draft lifecycle. `composeDraftIngredientIds` clears only via existing plate/serve/day/reset paths.
- Closing the sheet **does not** clear the draft. Reopening in the same day shows the preserved draft.

#### 5.1.1 Floor-peek outside tap

- The near-full sheet leaves a thin floor strip (canvas) visible.
- A pointer down on that canvas while the cook sheet is open:
  1. Clears `composeSheetOpen` (dismiss)
  2. Continues with normal `onTapMove` handling so movement can start — “walk away dismisses” stays fluid
- The **same** gesture must **not** also re-open cook if the tap happens to hit a station (close wins for that event; player taps again to open).
- Pointer events on Cook sheet chrome, Tickets panel, or the ingredient inspector modal must be captured by those layers — **no click-through** to canvas movement.

### 5.2 Fixed regions (top → bottom)

| Region | Size | Behavior |
|--------|------|----------|
| Header | Fixed | “Plate Dish”, guest/ticket line, ✕ |
| Selected strip | Fixed (one row) | Selected ingredients; horizontal scroll if needed |
| Flavor filter row | Fixed | Multi-select axis chips + clear/All |
| Name search | Fixed | Search field + explicit clear control |
| Filter summary | Fixed | Active axes + visible result count (e.g. “12 matching”) |
| Pantry grid | Remaining space | **Only** primary vertical scroll region |
| Footer | Fixed | Dish flavor bars (no numbers) + Plate |

Plate and flavor preview never scroll away.

### 5.3 Flavor multi-select (AND)

- Chip labels = existing axis labels (same as Flavors / customer phrases / Ideal).
- Selecting axes A, B, C shows unlocked ingredients that are **high on A AND high on B AND high on C**.
- “High” = `flavor[axis] >= 4` via existing `filterIngredientsByAxis` (inspector uses the same min).
- No axes selected (or “All”) = full unlocked list, then name search if any.
- Empty result = empty state plus the filter summary so AND narrowing is understandable.

### 5.4 Name search

- Case-insensitive; trim whitespace; substring match on ingredient **name** only.
- Applied after axis AND filtering.
- Explicit clear control (not only deleting text manually).
- Does not affect draft selection — only which pantry chips are listed.

### 5.5 Ephemeral filters vs preserved draft

| State | On cook close | On ticket change | On day change / teardown | On plate/serve |
|-------|---------------|------------------|--------------------------|----------------|
| Flavor chips + name search | **Reset** | **Reset** | **Reset** | **Reset** |
| `composeDraftIngredientIds` | **Keep** | Keep (existing) | Cleared by existing day flows | Cleared by existing plate/serve |

Filters are UI/session chrome only — never persisted in save data.

### 5.6 Unchanged cook rules

- Toggle still enforces 3–6 via existing `canToggleIngredient`
- Long-press still opens ingredient profile modal
- Pantry **scroll start cancels** an in-progress long-press (no accidental inspector while scrolling)
- Plate still dispatches existing `FLOOR_PLATE` / serve paths
- Dish bars still omit numeric values; Ideal/Flavors still show numbers

## 6. Screen map

| Screen | Tier | Behavior notes |
|--------|------|----------------|
| Open for service | `compact` | Title, one subtitle, Open / Edit buttons — **not** near-full |
| Edit layout tools | `compact` | Hint + Cancel/Done; floor remains primary |
| Guest review | `mid` | Fixed mid shell; inner scroll if copy overflows; one CTA |
| Prestige / soft reset | `compact` modal | Centered fixed card; dimmed floor |
| Tickets | `floating` | Keep Order / Ideal; ✕ / Escape / outside-tap; fixed max-height; no click-through |
| Cook / Plate Dish | `near-full` | §5 |
| Day summary | `near-full` | Fixed shell; body scrolls; footer = Back to floor / Visit shop only (no ✕ required) |
| Shop | `meta-full` | Existing sections only. Optional jump chips = scroll-to-section, not new catalog |
| Flavors | `meta-full` | Keep axis filter; optional name search sugar; fixed list rows |
| Recipes / Achievements | `meta-full` | Keep tabs + existing recipe search; fixed rows |
| Rating | `meta-full` | Hero + stats + recents in fixed blocks |
| Settings | `meta-full` | Existing save / audio / credits sections |
| Floor HUD actions | Buttons | Set table / Seat / Take orders / Clear / Close day — **not** sheets |
| Station affordance | Highlight | Clearer tap target when cook is available — not a new subsystem |

### 6.1 Consistency rules

1. Same token set across all of the above.
2. Dismissible overlays use the Tickets close language where dismissible.
3. Work/feedback sheets pin primary CTA in a fixed footer.
4. Do not resize shells based on text length.
5. Prefer truncating and scrolling over adding density or new chrome.

## 7. Architecture (UI layer)

### 7.1 Intent

Concentrate sheet chrome and size tiers in shared presentation/CSS (and small helpers) so `ServiceDayUi`, `FloorServiceHud`, and meta screens do not each invent heights.

Likely touchpoints (implementation plan will own the exact file list):

- `src/ui/styles/service-day.css`, `screens.css`, `global.css` — tokens + tier classes
- `src/ui/components/ServiceDayUi.ts` — cook sheet structure, open/close wiring, filter UI
- `src/store/selectors/service-day.ts` — stop auto-showing compose on proximity alone; require `composeSheetOpen` + eligibility
- `src/store/game-store.ts` — ephemeral `composeSheetOpen` (+ clear sites); **not** in save / RS1 payload
- `src/canvas/RestaurantApp.ts` — station hit-test before pathfinding in `onTapMove`
- `src/ui/components/FloorServiceHud.ts` — tickets stacking / dismiss alignment as needed
- Meta screens — apply `meta-full` spacing/row tokens without changing purchase/recipe logic
- Presentation helper for multi-axis AND filter reusing `filterIngredientsByAxis`

### 7.2 `composeSheetOpen` lifecycle (mandatory)

| Property | Rule |
|----------|------|
| Kind | **UI/meta store state only** — like `flavorInspectorIngredientId` / `floorToast`, not domain/`GameState` save fields |
| Persist | **Never** written to IndexedDB or Save Code |
| Set true | Only on successful eligible station tap (§5.1) |
| Set false | Actively on every close/invalidate event in §5.1 — not merely gated in a selector |

**Anti-pattern (forbidden):** leaving a stale `true` and relying on `composeSheetOpen && eligible` alone. That reopens the sheet the next time the player becomes eligible (e.g. walks back to a station) without a new tap.

**Required pattern:** eligibility selectors decide whether the sheet *may* show; `composeSheetOpen` is cleared whenever eligibility is lost or the player dismisses, so returning to a station requires a **fresh tap**.

## 8. Testing & acceptance

### 8.1 Interaction / filter

- Opens on eligible station tap; does **not** open on mere adjacency
- Ineligible station tap → toast; no open; no path onto station
- Closes via ✕, Escape, floor-peek tap (peek also starts movement), leave adjacency, room change, ticket invalid, plate, review, day teardown, hydrate/import, navigate away
- Stale-flag regression: clear open → walk away → walk back; sheet stays closed until retap
- AND multi-select high-axis narrowing; All clears; name search trim/case; clear-search control; result count
- Filters reset on close/ticket/day; draft preserved across close/reopen
- Long-press cancelled when pantry scroll begins
- Overlay stacking: taps on Cook / Tickets / inspector do not move the player
- Regression: plate/serve, tickets Order/Ideal, shop purchases, recipe search, navigation locks
- Do **not** weaken match/scoring tests or change floors to get green

### 8.2 Responsive / playability (worst case)

Fixture: ~100 unlocked ingredients, 6 selected, long ingredient names.

| Case | Expect |
|------|--------|
| Widths 320 / 360 / 390px | Fixed regions hold; pantry scrolls; Plate visible; chips don’t reflow shell height |
| Short landscape | Near-full shell still pins footer; pantry shrinks first |
| Safe-area insets | Header/footer respect top/bottom safe area; no clipped ✕ or Plate |
| Software keyboard open (search focused) | Search/filter remain usable; Plate not covered unsafely (scroll or compact keyboard layout within tokens) |

### 8.3 Accessibility

- Cook sheet exposes dialog (or equivalent) semantics while open
- Focus moves into the sheet on open; returns to a sensible floor control on close
- Escape closes cook when it is the top layer (inspector on top → Escape closes inspector first)
- Visual ellipsis must not remove accessible full ingredient names (`aria-label` / title)
- Axis chips and Plate remain keyboard/focus reachable where the app already supports focusable controls

## 9. Rollout checkpoints (independently verifiable)

Keep dependency order. **Each checkpoint** must land with: automated tests for that slice **and** representative Playwright screenshots (mobile widths above). A layout-only change must not ship without the interaction assertions for that slice.

| Checkpoint | Delivers | Gate |
|------------|----------|------|
| **C0** | Size tokens + shared sheet shell classes | Screenshot compact / mid / near-full shells on a fixture screen |
| **C1** | Cook open/close + station hit-test + `composeSheetOpen` lifecycle | Interaction tests in §8.1 (no filters yet beyond existing list) |
| **C2** | Near-full cook layout + AND flavor filters + name search + summary | Filter tests + worst-case screenshots |
| **C3** | Compact/mid overlays (open day, review, ceremonies, layout tools) | Screenshots + smoke that CTAs still dispatch existing actions |
| **C4** | Meta-full tabs (Shop, Flavors, Recipes, Rating, Settings) | Purchase/recipe/nav regressions + screenshots |
| **C5** | Station affordance polish + tickets stacking alignment | Click-through / toast tests + screenshots |

Ship nothing that changes payouts or unlock math.

## 10. Open for implementation plan (not product forks)

- Exact CSS `%` / `vh` / `rem` numbers per tier and control token
- Precise store field name (`composeSheetOpen` vs equivalent)
- Exact toast copy for ineligible station taps
- Flavors-tab name search: optional sugar in C4; cook name search required in C2
