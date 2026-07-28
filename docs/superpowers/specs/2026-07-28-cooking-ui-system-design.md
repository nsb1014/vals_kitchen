# Cooking UI & Shared Chrome System — Design

**Date:** 2026-07-28  
**Status:** Draft — awaiting user review  
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
| Cook close | ✕, Escape, outside-tap — same language as Tickets; walking away also dismisses |
| Cook browse | Multi-select **flavor axis** chips; **AND** filter; “high” on each selected axis |
| High threshold | Reuse existing Flavors-tab / inspector axis “high” helper — not a new rule |
| Appliance filter | **Not in this design** (deferred) |
| Food-world categories | **Not used** (no protein/veg/spice browse model) |
| Name search on cook | Yes — presentation filter on ingredient **name** only (not a mechanic) |
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
| Long labels | Ellipsis truncate — never grow the control |

### 4.3 Visual tokens

Keep the existing warm diner palette (`--vk-*`): deep browns, gold accent, sage action/selected. This is a **layout and interaction** pass, not a rebrand. Prefer simplicity: one radius scale, one chip style, one primary button style.

## 5. Cook sheet

### 5.1 Open / close

**Open when all are true**

1. Service day floor active (existing compose eligibility)
2. Player adjacent to a cook station (existing adjacency)
3. An open ticket is available to cook (existing ticket selection rules)
4. Player **taps** the station (new: replace proximity auto-open)

**Close when**

- ✕ tapped, or Escape, or outside-tap (Tickets pattern), or player leaves station adjacency

**Draft behavior**

- No new draft lifecycle. `composeDraftIngredientIds` clears only via existing plate/serve/day/reset paths.
- Closing the sheet **does not** clear the draft. Reopening the sheet in the same day shows the preserved draft (existing save/resume behavior).

### 5.2 Fixed regions (top → bottom)

| Region | Size | Behavior |
|--------|------|----------|
| Header | Fixed | “Plate Dish”, guest/ticket line, ✕ |
| Selected strip | Fixed (one row) | Selected ingredients; horizontal scroll if needed |
| Flavor filter row | Fixed | Multi-select axis chips + clear/All |
| Name search | Fixed | Filters by name substring over the axis-filtered unlocked list |
| Pantry grid | Remaining space | **Only** vertical scroll region |
| Footer | Fixed | Dish flavor bars (no numbers) + Plate |

Plate and flavor preview never scroll away.

### 5.3 Flavor multi-select (AND)

- Chip labels = existing axis labels (same as Flavors / customer phrases / Ideal).
- Selecting axes A, B, C shows unlocked ingredients that are **high on A AND high on B AND high on C**.
- No axes selected (or “All”) = full unlocked list (minus name search if any).
- “High” = existing inspector/filter threshold behavior (do not invent a second threshold).
- Empty result = existing empty-state pattern (“No ingredients match”).

### 5.4 Unchanged cook rules

- Toggle still enforces 3–6 via existing `canToggleIngredient`
- Long-press still opens ingredient profile modal
- Plate still dispatches existing `FLOOR_PLATE` / serve paths
- Dish bars still omit numeric values; Ideal/Flavors still show numbers

## 6. Screen map

| Screen | Tier | Behavior notes |
|--------|------|----------------|
| Open for service | `compact` | Title, one subtitle, Open / Edit buttons — **not** near-full |
| Edit layout tools | `compact` | Hint + Cancel/Done; floor remains primary |
| Guest review | `mid` | Fixed mid shell; inner scroll if copy overflows; one CTA |
| Prestige / soft reset | `compact` modal | Centered fixed card; dimmed floor |
| Tickets | `floating` | Keep Order / Ideal; ✕ / Escape / outside-tap; fixed max-height |
| Cook / Plate Dish | `near-full` | §5 |
| Day summary | `near-full` | Fixed shell; body scrolls; footer actions fixed (Back to floor / Visit shop). ✕ only as alias for dismiss if added |
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
- `src/ui/components/ServiceDayUi.ts` — cook sheet structure, open/close wiring
- `src/store/selectors/service-day.ts` — stop auto-showing compose on proximity alone; gate on explicit open flag / tap
- `src/canvas/RestaurantApp.ts` (or interact path) — station tap → open compose when eligible
- `src/ui/components/FloorServiceHud.ts` — align tickets dismiss chrome only as needed
- Meta screens — apply `meta-full` spacing/row tokens without changing purchase/recipe logic

### 7.2 State for compose visibility

Replace “near station ⇒ sheet visible” with something equivalent to:

- `composeSheetOpen` (or reuse a minimal store flag) set `true` on valid station tap
- set `false` on close / leave adjacency / day teardown

Eligibility to *open* still uses existing ticket + adjacency selectors. No domain reducer changes required for scoring or tickets.

## 8. Testing expectations

- Unit/UI tests: compose opens on tap when eligible; does not open on mere adjacency; closes via ✕ / leave range
- Filter tests: AND multi-select high-axis narrowing; All clears; name search if shipped
- Regression: plate/serve, long-press inspector, tickets Order/Ideal, shop purchases, recipe search, navigation locks
- Do **not** weaken match/scoring tests or change floors to get green

## 9. Rollout shape

Single design; implement in dependency order (plan will detail):

1. Size tokens + shared sheet shells
2. Cook open/close + near-full cook layout + flavor AND filters
3. Compact/mid overlays (open day, review, ceremonies, layout tools)
4. Meta-full tab pass (Shop, Flavors, Recipes, Rating, Settings)
5. Polish station affordance + tickets chrome alignment

Ship nothing that changes payouts or unlock math.

## 10. Open for implementation plan (not product forks)

- Exact CSS `%` / `vh` / `rem` numbers per tier and control token
- Precise store flag name for `composeSheetOpen`
- Day Summary: keep Back to floor / Visit shop only (no ✕) unless polish pass adds ✕ as a pure dismiss alias
- Flavors-tab name search: optional sugar in the meta-full pass; cook name search is required
