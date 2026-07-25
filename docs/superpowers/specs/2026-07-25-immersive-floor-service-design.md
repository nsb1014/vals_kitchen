# Immersive Floor Service — Design

**Date:** 2026-07-25  
**Status:** Approved 2026-07-25  
**Implementation plan:** [../plans/2026-07-25-immersive-floor-vertical-slice.md](../plans/2026-07-25-immersive-floor-vertical-slice.md)  
**Product:** Restaurant Simulator (`vals_kitchen`)

## 1. Goal

Replace the tap-menu / serial-queue service fantasy with a Chef RPG–like **walkable ¾ restaurant**: player character, concurrent seated parties, kitchen-station cooking, table set/clear routines, and room growth — while **keeping** flavor scoring, economy, unlocks, content corpus, and save infrastructure as callable kernels.

## 2. Locked decisions

| Topic | Decision |
|-------|----------|
| Service model | Concurrent floor service; multiple seated customers at once |
| Time pressure | None (no patience meters, no day clock fail) |
| Day end | Restaurant clear: last diner leaves **and** no dirty tables left uncleared |
| Cook loop | Order at table → compose at kitchen station → carry dish → deliver |
| Cooking UI | Existing ingredient compose UI, relocated to stations; equipment still gates |
| Movement | Tap-to-move with pathfinding; large interact targets |
| Perspective | ¾ / Chef RPG–like depth, Y-sort, wall height |
| Art | Expand vendored Kenney + project-generated CC0 for gaps; honest CREDITS |
| Architecture | New floor/ticket/seat world; keep score/economy/content/save kernels |
| Eating | Post-serve dine dwell occupies seat (pacing only; no tip penalty) |
| Table lifecycle | `Unset` → `Ready` → `Occupied` → `Dirty` → `Ready` |
| Morning | Must **set** each table before it can seat |
| After leave | Must **clear** before reseat |
| Parties | Party seating on multi-chair tables |
| Tickets | Queue up to **4** (full 4-top or mixed); **one plated dish carried** at a time |
| Onboarding | Day-1 forced tutorial through full loop |
| Room growth | Pair expansions (placable area) with table/kitchen unlocks |
| Recipe mastery | Per-recipe levels 1–10; per-serve rating bonus only when that dish is served; level shown in unlocked dishes |

## 3. What to keep vs replace

### Keep (libraries / kernels)

- Flavor aggregate, match stars, recipe match, affinity
- Tips, cash, rating, prestige, soft reset
- Ingredient / equipment / recipe content + validators
- Shop purchase rules (adapted to expansions + footprints)
- IndexedDB + RS1 save codes (schema version bump)

### Replace

- Serial `queueIndex` active-day model and “Ready to serve?” modal loop
- Flat orthographic `GridLayer` / single `CustomerLayer` / fit-only camera
- Seating as `tableCount × 2` with no chair slots
- Service HUD that treats the floor as a backdrop

### Keep as technology, not as scene

- PixiJS 8 renderer + Zustand + DOM overlays for sheets/menus

## 4. Service domain

### 4.1 Day pool

On open, generate a customer **pool** sized by existing `customersPerDay` (rating / prestige / day / seating capacity inputs — PRD numbers retuned as needed). Guests enter a **door waiting line** when no suitable `Ready` seats exist.

### 4.2 Stages

```text
WaitingAtDoor → Seated → OrderTaken → (ticket in queue)
→ Cooking/Composed → DishCarried → Served (pay/score)
→ Eating → Leaving → (table Dirty)
```

Pool exhausted + no one Waiting/Seated/Eating/Leaving + all tables not Dirty → day complete → summary.

### 4.3 Seats and parties

- Each table placement defines **chair slots** `{ slotIndex, facing, sitAnchor }`.
- Parties claim adjacent slots on one table (2-top / later 4-top).
- Capacity is **count of chair slots on Ready tables**, not abstract table×2 alone.

### 4.4 Tickets

- Taking orders for a party can enqueue up to **4** tickets total across the restaurant.
- Compose UI binds to a selected ticket at a valid station.
- Player may carry **one** plated dish; deliver to the matching seat/customer.
- Wrong seat: no serve (prompt / refuse); no spill mini-game in v1.

### 4.5 Scoring handoff

On successful deliver, call existing serve/score/tip/rating kernels with that customer’s preference + composed ingredients. Then start Eating dwell; mastery XP applies if the dish matched a known recipe (see §7).

### 4.6 Saves

Mid-day save serializes: pool + per-guest stage + seat assignments + table states + ticket queue + carry state + player position + compose draft for selected ticket. Bump save version; migrate or soft-reset incompatible mid-day blobs.

## 5. World and rendering

### 5.1 Map

- Logical walk grid for nav, placement, and persistence.
- Render layers: floor → walls/objects (tall) → Y-sorted actors/furniture → FX.
- Starter layout reads as a **full** dining room + kitchen + door (not a 4×4 stub).
- **Expansions** add placable regions (dining wing / kitchen wing). Tables require dining cells; stations require kitchen cells.

### 5.2 Navigation

- A* on walkable tiles; solids from walls + furniture footprints + occupied chairs.
- Tap floor → move; tap interactable → path to approach cell → interact.

### 5.3 Actors and animation

- Player: walk, idle, carry, set/clear, interact.
- Customers: walk, sit, eat, leave; visual variety (multiple Kenney / generated variants).
- Basic clips only in vertical slice; expand variety later.

### 5.4 Camera

- Follow player, clamp to map; integer scale preferred; pan as map grows.

### 5.5 Layout edit

- Between days (or edit mode): place/move/rotate furniture on grid.
- Placements rebuild seat graphs + nav; invalid kitchen/dining zone rejected.

## 6. UI shell

### During service

- Floor-first; hide or collapse bottom nav.
- Thin HUD: cash, rating, prestige, day.
- **Ticket strip** (≤4): select ticket / camera hint to customer or station.
- Bubbles for prefs on take-order and short react on deliver.
- Compose as bottom sheet only at valid station with a selected ticket.
- Carry indicator on player sprite/HUD.

### Between days

- Shop (expansions, tables, stations, ingredients via equipment), Flavors, Recipes (with mastery level badges), Rating, Settings.
- Edit Layout before open.
- Open day → morning set phase (tutorial on day 1).

### Day 1 tutorial

Forced path: set tables → first party seats → take orders → station compose → deliver → wait through eat → clear → close summary. Prompts block skipping critical steps.

## 7. Recipe mastery

- Track per `recipeId`: `level` (1–10) and progress toward next level.
- **Level 1** on first **matched** serve of that recipe.
- Serves required to advance: L1→L2 = 2, L2→L3 = 3, … L9→L10 = 10 (after unlocking L1).
- **Bonus:** small rating contribution **only on a serve of that specific matched dish**, scaled by its level (exact magnitudes in PRD).
- **UI:** each unlocked dish in the recipe book shows its level next to the name.
- Unmatched freestyle dishes do not gain mastery.

## 8. Progression pairing

| Unlock | Effect |
|--------|--------|
| Dining expansion | More placable dining tiles |
| Kitchen expansion | More placable kitchen tiles |
| Table (2-top / 4-top) | Requires free dining footprint; adds chair slots |
| Station (prep/grill/oven/…) | Requires free kitchen footprint; gates compose ingredients as today |
| Bundles (optional shop entries) | Expansion + starter furniture for readable growth |

Soft reset: retain layout policy decided in PRD reopen (default recommendation: **keep placed layout and mastery**, reset cash/rating/unlocks per existing soft-reset rules unless PRD says otherwise — finalize in PRD pass).

## 9. Budgets and assets

- Raise Tech-Stack initial JS budget after measuring the slice (planning band ~250–300 KB gzip; do not ship a fake number — measure and write the real ceiling).
- Atlas budget: multi-MB lazy OK; prioritize ¾ tiles, chairs, chairs, character variants.
- Stay on Pixi; no Phaser.
- CREDITS.json remains generated source of truth; generated art labeled as project CC0.

## 10. PRD / docs impact

Reopen and rewrite conflicting sections:

- PRD §3 service flow, §9 layout/seating, §12 non-goals (timers stay out; floor sim / concurrent seats / set-clear **in**), §13.1 tap-one-at-a-time
- Tech-Stack budgets + camera/pan + ¾ tile conventions
- Frontend-Guidelines canvas responsibilities (ticker world, seats, tickets)
- Progress.md new phase(s) for immersive floor

## 11. Vertical slice (acceptance)

Ship a playable slice before full content art pass:

1. Starter ¾ room (dining + kitchen + door)
2. Player tap-to-move pathfinding
3. Two 2-tops with chairs; set / clear
4. Door waiting → seat party → take up to 4 tickets
5. One station + compose sheet + carry + deliver
6. Eat dwell → leave → clear → day end when clear
7. Score/pay via existing kernels; recipe mastery increments on match
8. Day-1 tutorial flags
9. Mid-day save/restore of floor state

## 12. Non-goals (this design)

- Patience / rage-quit timers
- Cooking mini-games
- Staff NPCs
- Decor affecting score
- Multiplayer
- Wrong-dish spill physics

## 13. Risks

- ¾ art coverage vs Kenney limits → mitigate with generated CC0 sheets
- Save complexity for many actors → strict state machine + tests
- Bundle size → lazy atlases, measure after slice
- Tutorial friction → skip flag only after first successful day (optional later)

---

## Spec self-review

- Soft-reset layout + mastery retention locked in PRD §8 / §13.3.
- Mastery curve and per-serve-only bonus consistent with recipe book UI.
- Architecture matches “new floor, keep kernels” — not queueIndex stretching.
- Implementation: [../plans/2026-07-25-immersive-floor-vertical-slice.md](../plans/2026-07-25-immersive-floor-vertical-slice.md).
