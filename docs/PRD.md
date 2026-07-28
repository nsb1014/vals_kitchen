# Product Requirements Document — Restaurant Simulator

**Status:** Design complete; Phases 0–7 implemented; **immersive floor service redesign approved 2026-07-25** (see [Progress.md](./Progress.md), [superpowers/specs/2026-07-25-immersive-floor-service-design.md](./superpowers/specs/2026-07-25-immersive-floor-service-design.md))  
**Authoritative inputs:** [RESEARCH.md](./RESEARCH.md), confirmed user rulings (2026-07-24), immersive floor rulings (2026-07-25)  
**Formula ownership:** This document is the **single source of truth** for all gameplay numbers, formulas, and product rules. Other docs reference this file rather than restating values.

---

## Table of Contents

1. [Vision & Fantasy](#1-vision--fantasy)
2. [Target Player & Platform](#2-target-player--platform)
3. [Core Gameplay Loop](#3-core-gameplay-loop)
4. [Feature List](#4-feature-list)
5. [Flavor & Taste System](#5-flavor--taste-system)
6. [Economy](#6-economy)
7. [Rating, Reviews & Prestige](#7-rating-reviews--prestige)
8. [Failure & Soft Reset](#8-failure--soft-reset)
9. [Restaurant Layout & Building](#9-restaurant-layout--building)
10. [Progression & Content Pacing](#10-progression--content-pacing)
11. [Save & Persistence (User-Facing)](#11-save--persistence-user-facing)
12. [Non-Goals](#12-non-goals)
13. [Decisions & Rejected Alternatives](#13-decisions--rejected-alternatives)

---

## 1. Vision & Fantasy

The player owns a small restaurant and grows it over hundreds of in-game days into a renowned kitchen. Each **service day** is a discrete session on a **walkable ¾ restaurant floor**: set tables, seat concurrent parties, take orders, cook at kitchen stations, deliver dishes, let guests dine, clear tables, then close when the room is clear. Dishes are composed from unlocked ingredients to match stated taste preferences (never dish names). Earnings and reviews still come from flavor mastery — locomotion and station work are the service skill, not real-time fail timers.

Long-term power comes from **prestige** — reaching a 6-star restaurant rating triggers a prestige that permanently increases all customer payouts while resetting rating to baseline. Failure at 0 stars is a **soft reset**: run progress is lost, but prestige count and recipe mastery are forever; **placed layout is kept** (2026-07-25).

The fantasy blends **Chef RPG** (walkable floor, day cycle, prestige, recipe discovery, layout building), **Good Pizza, Great Pizza** (preference dialog, not exact orders), and **Papa's** (steep match-to-tip curve) — **without** patience meters, day clocks, or rush-hour fail states.

**Art direction:** ¾ top-down pixel art in the spirit of Chef RPG / Stardew. Logical grid underneath; tall furniture, Y-sorted actors. All art and audio CC0.

---

## 2. Target Player & Platform

| Attribute | Target |
|-----------|--------|
| **Player** | Casual-to-midcore mobile players who enjoy optimization, collection, and mastery loops; comfortable reading short preference text |
| **Session** | 5–20 minutes per service day; 200–400 hours total across many days |
| **Platform** | Mobile-first web; **primary QA target: iPhone 17 Safari** |
| **Business model** | Free to play; no login; hosted entirely on free static hosting |
| **Persistence** | Local browser save + optional Save Code export/import |

See [Tech-Stack.md](./Tech-Stack.md) for viewport, touch, and hosting details.

---

## 3. Core Gameplay Loop

### 3.1 Macro Loop (Multi-Day)

```
[Build Phase] → [Open Day] → [Floor Service] → [Day Summary] → [Spend/Earn] → repeat
                      ↑                                              |
                      └──────── prestige / soft reset ←──────────────┘
```

1. **Build phase (between days):** Spend on ingredient unlocks, **room expansions**, tables, kitchen stations. Drag furniture on a grid-locked layout inside dining/kitchen zones.
2. **Open day:** Player opens the restaurant. Day modifiers shown. Morning **set tables** required before seating.
3. **Floor service:** Parties wait at the door, seat when a suitable **Ready** table exists, give taste prefs on take-order. Player keeps a **ticket queue (max 4)**, composes at a **kitchen station** (3–6 ingredients), carries **one** plated dish, delivers to the matching guest. **No patience timers.** Guests **eat** (seat occupied, pacing only), leave, table becomes **Dirty** until **cleared**.
4. **Day end:** When the customer pool is fully served **and** the restaurant is clear (no diners, no dirty tables), day summary + auto-save.
5. **Meta progression:** Repeat until 6★ (prestige) or 0★ (soft reset).

### 3.2 Service Day Structure (Start to Finish)

| Step | Player Action | System Behavior |
|------|---------------|-----------------|
| 1. Pre-day | Layout, shop, inspect, recipe book | Cash, rating, prestige, unlocks |
| 2. Open | Open Restaurant | Roll day seed; modifier; `customers_per_day`; spawn door line |
| 3. Morning | Set each table | `Unset` → `Ready`; tutorial on day 1 |
| 4. Seat / order | Tap-to-move; take party orders | Tickets ≤4; bubbles with prefs |
| 5. Cook | At station, compose for selected ticket | Equipment gates ingredients |
| 6. Deliver | Carry dish to matching seat | Score + pay; mastery if recipe matched; start eat dwell |
| 7. Clear | After leave, clear dirty table | `Dirty` → `Ready`; next party may seat |
| 8. Close | Auto when floor clear | Day summary; auto-save |
| 9. Post-day | Shop, expansions, layout, settings | No time pressure |

**Customer count formula** (owned here):

```
customers_per_day = min(seating_capacity, floor(3 + rating × 0.8 + P × 0.5 + day^0.2))
```

Where `seating_capacity` = count of **chair slots** on placed tables (not abstract only), `rating` = 0–6, `P` = prestige, `day` = completed service days.

| Phase | Typical customers/day |
|-------|----------------------|
| Early (day 1–20) | 4–6 |
| Mid (day 50, 3★, P1) | 7–9 |
| Late (day 200, 4★, P5) | 10–12 |

### 3.3 Table & ticket rules

| Rule | Value |
|------|-------|
| Table states | `Unset` → `Ready` → `Occupied` → `Dirty` → `Ready` |
| Ticket queue | Max **4** open/plated tickets |
| Carry | **One** plated dish at a time |
| Party seating | Whole party on one table’s chairs (2-top / 4-top) |
| Eat dwell | Pacing/occupancy only — **no** tip penalty |
| Movement | Tap-to-move pathfinding |

---

## 4. Feature List

### Core

- [ ] Discrete service days **without** patience/fail timers
- [ ] Walkable ¾ restaurant floor; tap-to-move player
- [ ] Concurrent seated parties; door waiting line
- [ ] Table set / clear lifecycle; eat dwell after serve
- [ ] Ticket queue (max 4); one carried plated dish
- [ ] Station-based compose (3–6 ingredients); chat-bubble prefs (never dish names)
- [ ] 0–10 star per-customer review from flavor match
- [ ] Recipe mastery levels 1–10 with per-serve rating bonus
- [ ] Restaurant rating 0–6 with payout scaling
- [ ] Prestige at 6★; soft reset at 0★ (keep layout + mastery + prestige)
- [ ] Money economy: ingredients, tables, stations, **room expansions**
- [ ] Grid-locked layout with dining/kitchen zones; chair slots define seating
- [ ] Ingredient flavor profile inspector
- [ ] ~100 unlockable ingredients; ~12 kitchen upgrades
- [ ] ~1000 authored recipes (soft scoring aid + recipe book collection)
- [ ] Daily modifiers (5–10 rotating)
- [ ] 20 customer archetypes
- [ ] Local save + Save Code export/import
- [ ] Day-1 tutorial through full floor loop
- [ ] CC0 pixel art and audio throughout

### UI Screens

| Screen | Purpose |
|--------|---------|
| Restaurant floor (PixiJS) | Walkable world, layout edit, open/close day |
| Ticket strip / HUD | Active tickets; Orders panel with **Order** text + **Ideal** flavor bars |
| Station compose sheet | Ingredient picker; dish flavor bars (no numeric values) |
| Ingredient Inspector | 16-axis flavor bars **with** numeric values per unlocked ingredient |
| Shop | Ingredients, tables, stations, expansions |
| Rating | Current stars, recent reviews, prestige count |
| Recipe Book | Discovered recipes **with mastery level** |
| Day Summary | Earnings, matches, rating delta |
| Settings | Save Code backup/restore, audio, attribution |

---

## 5. Flavor & Taste System

### 5.1 Product Rules

1. Customers state **taste preferences**, never a specific dish name — every request must be satisfiable with currently unlocked ingredients alone.
2. **Any** 3–6 ingredient combination is cookable and scored on flavor match.
3. Matching an authored recipe grants a **named-dish bonus** (see §5.5); recipes are a soft aid, not a hard gate.
4. Player can **visually inspect** the full 16-axis profile of every unlocked ingredient at any time.

Full schema, aggregation, and scoring algorithms: [Backend-Guidelines.md](./Backend-Guidelines.md). Axis keys and phrase tables summarized here for product clarity.

### 5.2 Sixteen Flavor Axes

**Group A — Basic Tastes (0–10):** Sweet (`SW`), Salty (`SA`), Sour (`SO`), Bitter (`BI`), Umami (`UM`)

**Group B — Aroma Families (0–10):** Herbal (`HE`), Fruity (`FR`), Earthy (`EA`), Smoky (`SM`), Pungent (`PU`), Nutty (`NU`)

**Group C — Mouthfeel & Intensity:** Rich (`RI`), Light (`LI`), Heat (`HT`), Crunch (`CR`) on 0–10; Temperature (`TE`) categorical **−1 / 0 / +1** (cold / neutral / hot)

### 5.3 Customer Request Text

Generated from **overlapping descriptor schemas** — phrases map to axis bands (low / mid / high) using the **same axis labels as the Flavor Inspector** (Sweet, Salty, Umami, Pungent, Heat, …):

| Band | Phrase form |
|------|-------------|
| High (7–10) | `high Umami`, `high Rich`, `high Heat`, … |
| Mid (4–6) | `moderate Umami`, `moderate Salty`, … |
| Low / avoid (0–3) | `low Sweet`, `low Heat`, … |

**Ideal flavor profile:** Every generated request stores `idealProfile` — the aggregate flavor vector of a **witness** 3–6 ingredient combo from the player's unlocked pantry. The Tickets panel Ideal view shows that profile with the same 0–10 bars (and numeric values) as the Flavors tab. The cooking compose screen shows the player's current dish with the same bars **without** numeric values.

**Generation (Ruling 12):** Roll 1 of 20 archetypes → pick a witness 3–6 ingredient combo from the unlocked set → derive **2–3 primary bands on actionable axes only** — axes that (a) appear strongly on unlocked ingredients (variance + peak value in the current pantry) and (b) change achievable dish scores across 3–6 combos. Optional avoid cue when a high-variance axis has strong carriers in the pantry but the witness dish stays low. Compose **2–3 bubble phrases** with Flavors-tab labels (`high Umami`, `moderate Rich`, `low Heat`). Pick randomly among satisfiable witness combos for day-to-day diversity. **Every like/dislike must be reachable and punishable with the current unlock set** so competent matches score high and clear mismatches score low. Examples:

- "I'm craving **high Umami** with **high Sour**. **Low Sweet**."
- "Give me **high Rich** with **moderate Smoky**. Keep **low Heat**."

### 5.4 Ingredient Inspector (UX)

- Accessible from kitchen compose screen and a dedicated **Ingredients** tab.
- Each unlocked ingredient shows: name, icon, 15 continuous bars (0–10) plus temperature badge (−1/0/+1) — 16 axes total.
- Sort/filter by axis (e.g., "high umami", "low heat").
- Tap ingredient in compose flow for inline mini-profile.

### 5.5 Dish Scoring (Product Summary)

Per-customer review is **0–10 stars** (1 decimal display):

1. Aggregate dish vector from 3–6 ingredients (weighted mean + soft-max; see Backend-Guidelines).
2. Compare to customer preference vector → weighted satisfaction.
3. Add 15% weight from compound-affinity bonus (Ahn-style pairing).
4. **Named recipe bonus:** if ingredient set matches an authored recipe (order-independent), add **+0.75 stars** (cap 10) and display recipe name on review card.
5. **Recipe mastery bonus (2026-07-25):** if matched, also add `mastery_level × 0.05` stars (**only on that serve** of that recipe). Cap still 10.

```
match_stars = clamp(
  10 × (0.85 × weighted_sat + 0.15 × affinity_bonus)
  + recipe_bonus
  + mastery_bonus,
  0, 10)
recipe_bonus = 0.75 if matched_recipe else 0
mastery_bonus = mastery_level × 0.05 if matched_recipe else 0
```

**Mastery progression:** Level 1 on first matched serve. Serves to reach next level: 2 for L2, 3 for L3, … 10 for L10. Each unlocked dish in the recipe book shows its level. Unmatched freestyle dishes gain no mastery.

**Weighted satisfaction (2026-07-25):** Only primary and avoid axes count toward `weighted_sat`. Unmentioned axes no longer contribute a flat 0.7 each — that old rule compressed early reviews into a ~6–7 band regardless of match quality. Algorithm detail in [Backend-Guidelines.md](./Backend-Guidelines.md).

### 5.6 Satisfiability Guarantee

The customer request generator **must not emit preferences outside the flavor envelope of the player's unlocked ingredients**. For every representative reachable unlock state, and for every valid preference the generator produces, at least one 3–6 ingredient combination from the **unlocked set** must achieve the tier match floor:

| Unlocked ingredient count | Content witness floor (V5) | Competent-play floor (`findBestMatchCombo`) |
|---------------------------|----------------------------|---------------------------------------------|
| ≤ 5 (soft-reset starters) | **6.5** | **6.5** |
| 6–12 (early pantry) | **6.8** | **6.8** |
| ≥ 13 (early-mid pantry) | **7.0** | **6.75** |

**Two guarantees:** (1) **Content witness (V5):** the generator only emits preferences for which some 3–6 combo from the unlocked set scores ≥ the content witness floor — validated exhaustively in `validate-content`. (2) **Competent play:** bounded dish selection (`findBestMatchCombo`, shortlist + eval cap 512) meets the competent-play floor on representative unlock states in unit tests, including 13, 20, 40, and 100 unlocked ingredients within the ≥13 tier. Measured worst case across those unlock levels under the current heuristic is **6.776** stars; the 6.75 competent floor is set below that measured minimum with a small margin.

**Note:** The ≥13 content witness floor (7.0) can exceed what bounded competent search reliably finds on mid-size pantries (~20 ingredients) because witness combos may depend on compound-affinity synergy among individually low-ranked ingredients. Perfect-play oracle search is not required at runtime; the competent-play floor documents what the shipped heuristic guarantees.

---

## 6. Economy

### 6.1 Money Sources

| Source | Formula |
|--------|---------|
| Customer tip (primary) | See §7.3 full pipeline |
| Day bonus (optional) | +5% of day earnings if average match ≥7.0 |
| Volume bonus | `floor(dayEarnings × 0.10 × min(1, customersServed / seatingCapacity))` — rewards filling seats / covers, not day length |

### 6.2 Money Sinks

| Sink | Cost Formula | Parameters |
|------|--------------|------------|
| Ingredient unlock (#n, 0-indexed) | `floor(150 × 1.14^n)` | n = 0…99 (~100 ingredients) |
| Table / seating slot (#n) | `floor(200 × 1.12^n)` | n = 0…20 |
| Kitchen equipment (#n of 12) | `floor(500 × 1.18^n)` | n = 0…11 |
| Grid expansion tile (#n) | `floor(300 × 1.15^n)` | n = 0…15 |
| Kitchen annex (one-time) | `800` | Separate same-size back-kitchen room + connecting door |
| Decor (per type, flat) | plant 50 / flowers 75 / rug 120 / lamp 150 / sign 200 | Cosmetic only; soft cap 6 placed |

**Bulk-buy closed form** (for UI "buy N" previews):

```
total_cost(k items starting at level n) = base × growth^n × (growth^k - 1) / (growth - 1)
```

**Ingredient restock:** Starter 5 ingredients are free on soft reset. No per-use ingredient consumption — unlock is permanent for the run. (Simplifies tap-paced loop; depth is unlock pacing, not stock management.)

### 6.3 Kitchen Equipment (12 Total) — Ingredient Progression Gates

Each of the 12 kitchen equipment pieces **gates a themed ingredient group** in the shop. Buying equipment does **not** grant passive match or payout buffs; it only makes that group's ingredients **available to purchase** (see §6.5 two-gate economy).

**Cost formula** (owned equipment count index `n`, 0-indexed among **purchases** after the starting piece):

```
equipment_cost(n) = floor(500 × 1.18^n)   for n = 0…10
```

`prep_station` is **owned at game start** (no purchase). The 11 remaining pieces use `n = 0…10` in order below.

| Purchase `n` | ID | Display Name | Ingredient Group | ~Count |
|--------------|-----|--------------|------------------|--------|
| — (start) | `prep_station` | Prep Station | Pantry & Basics | 12 |
| 0 | `grill` | Grill | Grilled & Charred | 8 |
| 1 | `oven` | Oven | Roasted & Baked | 9 |
| 2 | `fryer` | Fryer | Fried & Crispy | 7 |
| 3 | `stockpot` | Stockpot | Simmered & Broths | 9 |
| 4 | `cold_station` | Cold Station | Fresh & Raw | 9 |
| 5 | `pastry_bench` | Pastry Bench | Pastry & Dough | 8 |
| 6 | `smoker` | Smoker | Smoked & BBQ | 7 |
| 7 | `wok` | Wok | Stir-Fry Pan | 9 |
| 8 | `fermentation_crock` | Fermentation Crock | Pickled & Fermented | 8 |
| 9 | `barista_station` | Barista Station | Coffee & Tea | 7 |
| 10 | `spice_rack` | Spice Rack | Herbs & Spices | 7 |

**Total ingredients:** 100 (exact partition; every ingredient belongs to exactly one equipment group). Full ingredient IDs: `src/data/ingredients.json` (Phase 1).

### 6.4 Starting & Soft-Reset Loadouts

| Context | Equipment | Ingredients |
|---------|-----------|-------------|
| **New game** | `prep_station` (owned) | 9 free from Pantry group: flour, salt, butter, onion, chicken, garlic, olive_oil, rice, egg |
| **New game cash** | **$500** starting cash (see §8.4 for soft-reset cash) | |
| **Soft reset (0★)** | `prep_station` only (all placement lost; repurchase other equipment) | 5 starters only: flour, salt, butter, onion, chicken |

Individual ingredient purchase costs still use the ingredient row in §6.2 (`floor(150 × 1.14^n)` by unlock order within the run). Equipment only unlocks shop **eligibility** for its group.

### 6.5 Two-Gate Economy

1. **Gate A — Equipment:** Spend milestone cash to buy a kitchen equipment piece → that ingredient group appears in the shop.
2. **Gate B — Ingredient:** Spend cash to buy each individual ingredient from eligible groups.

**Rejected:** Equipment auto-granting its whole group for free; equipment that both gates and applies passive stat buffs.

### 6.6 Layout Economy

- **Seating capacity** = number of placed table seats (each table tile contributes seats per furniture definition).
- More tables → higher `customers_per_day` cap → more income per day, but layout space and grid expansion costs create tradeoffs.
- **Kitchen annex (2026-07-26):** one-time shop unlock opens a **separate back-kitchen room** with the **same grid dimensions** as the main dining+kitchen floor (map size unchanged). A connecting door on the east kitchen wall leads to the back room; the return door is on the west wall. Stations may be placed in either kitchen in Edit Restaurant. Dragging a station onto the connecting door transfers it to the other room. Walls, south guest door, and dining zones stay functional on the main floor.

---

## 7. Rating, Reviews & Prestige

### 7.1 Restaurant Rating

- **Visible** on demand via Rating screen and HUD badge.
- **Starts at 3.0 stars** each run (and after prestige).
- **Range:** 0.0–6.0 (displayed to 1 decimal).
- **Per-customer movement:**

```
Δstars = (match_stars - 5) × 0.08
```

| Match | Δstars |
|-------|--------|
| 10 | +0.40 |
| 7 | +0.16 |
| 5 | 0.00 |
| 2 | −0.24 |

Clamp rating to `[0, 6]`.

### 7.2 Rating Multiplier (Payout)

```
rating_multiplier(stars) = max(0, stars / 3)^1.3
```

| Stars | Multiplier |
|-------|------------|
| 0 | 0.00× → soft reset |
| 1 | 0.28× |
| 2 | 0.62× |
| 3 | 1.00× (baseline) |
| 4 | 1.40× |
| 5 | 1.85× |
| 6 | 2.32× → prestige trigger |

As rating drops, customer payouts drop — recovery tension without timers.

### 7.3 Tip Calculation (Full Pipeline)

```
base_payout(day) = floor(20 + 8 × day^0.55)

match_quality = match_stars / 10

tip = floor(
  base_payout(day)
  × rating_multiplier(stars)
  × prestige_multiplier(P)
  × (0.3 + 0.7 × match_quality^1.5)
)
```

**Prestige multiplier:**

```
prestige_multiplier(P) = 1.18^P
```

| Prestige P | Multiplier |
|------------|------------|
| 0 | 1.00× |
| 1 | 1.18× |
| 5 | 2.29× |
| 10 | 5.23× |
| 15 | 10.07× |

**Example:** Day 50, rating 4.2, Prestige 2, match 8/10:

```
base = floor(20 + 8 × 50^0.55) = 88
rating_mult = (4.2/3)^1.3 = 1.52
prestige_mult = 1.18^2 = 1.39
match_factor = 0.3 + 0.7 × 0.8^1.5 = 0.801
tip = floor(88 × 1.52 × 1.39 × 0.801) = 148
```

### 7.4 Prestige Rules

| Rule | Detail |
|------|--------|
| **Trigger** | Restaurant rating reaches **6.0** |
| **Effect** | `P += 1`; rating resets to **3.0**; run continues (no soft reset) |
| **Permanence** | Prestige count **never decreases**; survives soft reset |
| **Payout** | Every customer pays `× 1.18^P` — exponential growth across prestiges |
| **UI** | Prestige ceremony screen; counter always visible |

---

## 8. Failure & Soft Reset

### 8.1 Trigger

Restaurant rating reaches **0.0** (from sustained poor matches).

### 8.2 Lost (Current Run)

- All **money**
- All **ingredients** except **5 starters:** flour, salt, butter, onion, chicken
- All **purchased kitchen equipment** except starting `prep_station` (must repurchase gates)
- Current **restaurant rating** (reset to 3.0)
- **Purchased expansions beyond starter room** reset to starter map bounds (furniture on kept tiles stays; excess placements clamped/removed per implementation)
- **In-progress service day** cleared on reset

### 8.3 Kept (Permanent)

- **Prestige count P** (irreversible, permanent)
- **Recipe book discoveries** — all `discoveredRecipeIds`
- **Recipe mastery** levels/progress per recipe (2026-07-25)
- **Placed layout** on the starter (and still-owned expansion) footprint — soft reset does **not** wipe furniture for busywork (2026-07-25)
- Save Code compatibility

### 8.4 Restart State

| Field | Value |
|-------|-------|
| Cash | $100 |
| Rating | 3.0 stars |
| Equipment | `prep_station` owned; other gates lost |
| Ingredients | 5 starters |
| Grid / room | Starter full-room map (see immersive floor starter); expansions re-purchased |
| Tables | Kept if still on valid tiles; otherwise restored to starter two 2-tops |
| Prestige | unchanged |
| Recipe book + mastery | unchanged |

---

## 9. Restaurant Layout & Building

### 9.1 Grid System

- **Tile size:** 16×16 px art, **2× integer scale** → 32 CSS px per tile (logical). Render is **¾** with Y-sort.
- **Starting map:** Full readable dining + kitchen + door (not a tiny 4×4 stub). Expandable via **dining/kitchen expansion** purchases.
- **Zones:** Tables only on dining tiles; stations only on kitchen tiles.
- **Placement:** Grid-locked; furniture footprints may be multi-tile; chairs are slot anchors on tables.
- **Drag-and-drop:** Between days; invalid placements rejected (overlap, out of bounds, wrong zone).

### 9.2 Placeable Categories

| Category | Examples | Gameplay Effect |
|----------|----------|-----------------|
| Tables | 2-seat, 4-seat (+ chairs) | Chair slots = seating capacity |
| Kitchen stations | Prep, grill, oven, … | Ingredient gates + compose interact |
| Room expansions | Dining wing, kitchen wing, **kitchen annex** | Placable area + nav mesh |
| Decor | Plants, rugs, lighting | **Cosmetic only** |
| Walls / floor | Tile variants | Cosmetic / blocking |

### 9.3 Build Phase UX

- Toggle **Edit Layout** between days.
- Ghost preview on drag; green/red validity tint.
- Shop purchases appear in inventory palette before placement.
- Progression pairs **expansions** with furniture so the room grows visually.

---

## 10. Progression & Content Pacing

**Design aspiration:** Depth from taste mastery, modifiers, layout, economy, and prestige — not repetition or timers. Total playtime is a **design aspiration** (see §2 session band) and an **observed metric** from simulation — **not a CI-verified requirement**.

### 10.1 Unlock Milestones

| Milestone | Target Day |
|-----------|------------|
| First new ingredient | 2–3 |
| 10 ingredients | 25–35 |
| 25 ingredients | 60–80 |
| 50 ingredients | 120–160 |
| 100 ingredients | 280–350 |
| All 12 kitchen upgrades | 180–250 |
| First prestige | **3–10** (fast by design — teaches the loop; retuned 2026-07-25 after match-score spread fix) |
| Prestige 5 | 40–80 cumulative days |
| Prestige 10 | 100–160 cumulative days |

### 10.1.1 Escalating Prestige Cycles (Ruling 2026-07-24)

The flat “first prestige at 25–40 days” target is **replaced**. Early prestiges stay fast; later cycles lengthen via per-prestige **rating resistance** (see [Backend-Guidelines.md §5](./Backend-Guidelines.md)). **Purchase costs do not scale with prestige** — prestige rewards come from higher tip/payout income (`1.18^P`), not more expensive shops.

**Hour projection assumption:** **10 minutes per service day** (midpoint of §2’s 5–20 minute session band). Cumulative real-time hours = `(cumulative_in_game_days × 10) / 60`. This converts in-game days to a human-readable metric only — **CI does not assert a playtime band.**

**Simulation horizon vs content cap:** `SIMULATION_PRESTIGE_CYCLE_CAP = 30` in `prestige-pacing.ts` is the **deep-sim verification horizon** (how many prestige cycles the opt-in `npm run test:sim` harness runs). It is **not** a designed content end state — prestige has no hard product cap; players may continue past 30 cycles indefinitely.

**Analytic pacing proxy:** The fast suite uses a calibrated closed-form curve fit to competent-play simulation (seed 424242):

```
projectedCycleDays(P) = round(min(68, 4 + 2.0×P + 0.03×P²))
```

The opt-in deep sim re-runs the full competent-play harness and **asserts the analytic proxy tracks simulated per-cycle days within 15% and cumulative days within 10%**. That relative agreement is what keeps the cheap proxy honest when resistance/economy constants change. Absolute cumulative hours are **reported** (console + sanity guard 20–2000 h) but not pass/fail gated.

**Observed competent-play curve (seed 424242, simulation harness):**

| Cycle | Prestige P at start | Days in cycle | Cumulative hours |
|-------|---------------------|---------------|------------------|
| 1 | 0 | 3 | 0.5 |
| 5 | 4 | 15 | 8.3 |
| 10 | 9 | 29 | 27.3 |
| 20 | 19 | 53 | 95.2 |
| 30 | 29 | 69 | **205.8** |

**Monotonicity:** Expected minimum cycle length increases with prestige index; RNG may wobble individual cycles ±1 day.

### 10.2 Depth Layers (Hour Budget)

| Layer | Mechanism | Hours |
|-------|-----------|-------|
| Composition mastery | 100 ingredients × flavor vectors | 40–80 |
| Customer archetypes | 20 templates + hidden secondary prefs | 20–40 |
| Daily modifiers | Trends, VIP, critic visits | 30–50 |
| Layout optimization | Grid vs seating tradeoffs | 20–30 |
| Economy puzzles | Budget vs match vs rating risk | 40–60 |
| Prestige loops | 6★ cycles with payout acceleration | 50–100 |
| Recipe discovery | ~1000 recipe book | 30–50 |

### 10.3 Daily Modifiers (5–10 Rotating)

Examples: "Trending: smoky +10% tips on SM-heavy dishes", "Food critic visit — match ≥8 or −0.2 rating", "Meatless mood — no protein ingredients bonus challenge". Rolled deterministically from day seed. Full list in content data phase.

### 10.4 Anti-Grind Design

- Meaningful decision every customer (taste matching skill).
- New ingredients change solution space.
- Prestige makes **payouts** faster, not **rating cycles** — later prestiges take longer to reach 6★.
- No mandatory idle/offline earnings.
- Income scales with match quality, not time spent.

---

## 11. Save & Persistence (User-Facing)

### 11.1 Local Save

- Progress saved **automatically** after each day summary to browser IndexedDB.
- **Mid-day interruption:** If the player reloads during an open service day, floor state is serialized and resumed: guest stages, seat assignments, table states, ticket queue, carried dish, player position, selected ticket compose draft. (Legacy serial `queueIndex` is superseded.)
- **No login.** Same browser + same origin restores progress on reload.
- First launch calls `navigator.storage.persist()` to request durable storage (see [Tech-Stack.md](./Tech-Stack.md)).

### 11.2 Save Code (Export / Import)

Settings → **Backup Save** → copy Save Code string.  
Settings → **Restore Save** → paste Save Code → confirm overwrite.

**Format:**

```
RS1.<base64url(lz-string.compressToUint8Array(JSON.stringify(saveEnvelope)))>
```

Prefix `RS1` = schema version 1. Typical size: 2–10 KB compressed. (lz-string 1.5.0 uses `compressToUint8Array`; older docs referenced `compressToUTF8`.)

### 11.3 User Warnings (Settings)

> Your progress is saved in this browser. To keep it safe:
> 1. Add this app to your Home Screen
> 2. Export a Save Code regularly
> 3. Playing in Private Browsing will not save progress

After ~3 service days on iOS, prompt **Add to Home Screen** once (dismissible).

Technical persistence architecture: [Backend-Guidelines.md](./Backend-Guidelines.md), [Tech-Stack.md](./Tech-Stack.md).

---

## 12. Non-Goals

| Non-Goal | Rationale |
|----------|-----------|
| Real-time fail timers / patience meters / rage-quit clocks | Rejected; concurrency uses seat occupancy + set/clear, not fail clocks |
| Idle or offline earnings | Rejected ruling |
| Multiplayer / social / login | Out of scope; local save only |
| Server backend / accounts | Free static hosting; no ops cost |
| External recipe dataset runtime dependency | Authored corpus; see §13 |
| Non-CC0 assets | Legal requirement |
| True isometric diamond projection | Use **¾** orthographic depth instead (2026-07-25) |
| Cooking mini-games | Compose UI at stations; walking is the skill |
| Staff automation / NPC chefs | Future scope; not v1 |
| Multiple restaurant locations | Future scope; not v1 |
| Decor gameplay bonuses | Ruling 7 — cosmetic self-expression only in v1 |
| Equipment passive stat buffs | Ruling 10 — equipment gates ingredients only |
| Abandoning mid-day on reload | Must resume floor day state |

**Explicitly in scope (2026-07-25):** concurrent floor simulation, pathfinding, party seating, ticket queue, table set/clear, eat dwell, room expansions, recipe mastery.

---

## 13. Decisions & Rejected Alternatives

All decisions below are **final**. Do not reopen without explicit user direction.

### 13.1 Pacing — Concurrent Floor Service Without Fail Timers

**Decided (supersedes 2026-07-24 one-at-a-time queue, 2026-07-25):** Player walks a ¾ restaurant floor. Multiple parties seat concurrently. Orders via ticket queue (max 4); cook at stations; deliver; guests eat then leave; set/clear tables. Day ends when the restaurant is clear. **No** patience meters, day-clock fails, or rush mode.

**Rejected:**
- Serial one-at-a-time queue UI as the primary fantasy
- Real-time pressure / rush-hour fail mode
- Idle / offline earnings
- Cooking mini-games as the skill core

**Rationale:** Chef RPG–like immersion with the existing flavor-scoring brain; mobile-friendly tap-to-move; depth from taste-matching + floor choreography.

### 13.2 Art — ¾ Pixel Art

**Decided (2026-07-25):** Chef RPG–like **¾** top-down pixel art with Y-sort and wall height. Logical 16×16 grid at 2× scale. Kenney CC0 + project-generated CC0 gaps.

**Rejected:** Flat vector UI aesthetic; pure diamond isometric; flat orthographic-only restaurant as the long-term look.

**Rationale:** Matches reference fantasy; PixiJS crisp pixels; honest CC0 pipeline.

### 13.3 Failure — Soft Reset

**Decided (updated 2026-07-25):** At 0★, lose money and most ingredients/equipment unlocks; **keep prestige, recipe discoveries, recipe mastery, and placed layout** (clamped to owned room). Restart rating 3★, soft $100, starter loadout.

**Rejected:** Full wipe including prestiges; wiping layout for busywork; keeping all ingredients on failure.

**Rationale:** Recettear-style retained meta-progress; layout/mastery are identity, not expendable grind.

### 13.4 Delivery — One Full Build

**Decided:** Single complete implementation pass. These docs must be sufficient for an agent to build the entire game.

**Rejected:** Incremental vertical slice with phased playable releases.

**Rationale:** User ruling; avoids partial-system integration debt.

### 13.5 Recipe Corpus — Authored In-House

**Decided:** Generate **~1000 recipes** from the **~100-ingredient master list** using cuisine templates + flavor-affinity constraints, validated against the 16-axis schema. **100% license-clean; no external runtime dependency.** Master ingredient list may be **informed by USDA FoodData Central (CC0)** for naming/categories only.

**Rejected:**
- TheMealDB (paid $10 key; non-CC0 artwork)
- RecipeNLG, Recipe1M, Food.com (license-encumbered)
- Shipping third-party recipe prose

**Rationale:** User ruling overrides [RESEARCH.md §4](./RESEARCH.md) TheMealDB hybrid recommendation. Zero cost, no license risk, every recipe guaranteed composable from unlockable ingredients.

**Deviation note:** RESEARCH.md recommended TheMealDB structural templates + Wikibooks QA. PRD and [Backend-Guidelines.md](./Backend-Guidelines.md) replace that with fully authored generation. See Backend-Guidelines for pipeline.

### 13.6 Recipes — Soft Scoring Aid

**Decided:** ANY 3–6 unlocked ingredient combo is cookable and flavor-scored. Matching an authored recipe grants named-dish bonus (+0.75 stars) and recipe book entry. Customers never require a specific recipe.

**Rejected:** Recipe dictionary as hard gate (customer implies dish X → must cook X).

**Rationale:** Preserves satisfiability guarantee for taste-only customer requests.

### 13.7 Decor — Cosmetic Only (v1)

**Decided:** Decor items (plants, rugs, lighting, floor paint) are **pure self-expression**. They have **zero mechanical effect** on match scoring, tips, rating, or customer generation.

**Rejected:** +1% match tolerance at high decor score (RESEARCH.md §1 Diner Dash borrow); flat tip multiplier from decor.

**Rationale:** Ruling 7; avoids hidden power in layout cosmetics. RESEARCH.md decor→ambiance note is superseded.

### 13.8 Mid-Day Save — Resume In Place

**Decided:** Reload during an open service day restores **`activeDay`** with queue index, current customer preference, and partial compose selection intact. Player continues from exact interruption point.

**Rejected:** Abandoning the day on reload; closing the day early with partial credit.

**Rationale:** Mobile players are interrupted constantly; losing a day mid-queue is unacceptable friction.

### 13.9 Recipe Book — Persists Across Soft Reset

**Decided:** `discoveredRecipeIds` are **permanent meta-progression** alongside prestige count. Soft reset does not remove recipe book entries or suspend the +0.75 named-dish bonus.

**Rejected:** Losing recipes on reset; keeping IDs but disabling named-dish bonus until re-cooked.

**Rationale:** Long-term completion goal across the 200–400 hour target.

### 13.10 Equipment — Ingredient Gates (Not Passive Buffs)

**Decided:** The 12 kitchen equipment pieces **only gate ingredient groups** (see §6.3 table). No "+2% match floor" or similar numeric passives.

**Rejected:** Equipment as passive stat boosters; equipment that both gates and buffs.

**Rationale:** Ruling 10; progression walls are content access, not invisible power creep.

### 13.11 Two-Gate Economy

**Decided:** Buying equipment makes its ingredient group **shop-eligible**; each ingredient still costs money individually per §6.2.

**Rejected:** Equipment unlocking its whole group for free.

**Rationale:** Ruling 11; preserves ingredient spending as steady economy sink while equipment remains milestone purchases (~12 walls).

### 13.12 Customer Requests — Unlocked-Ingredient Derived

**Decided:** Customer taste profiles are **generated from the player's currently unlocked ingredient flavor envelope**. The generator never asks for axis emphasis the unlocked set cannot satisfy. Early game produces simpler requests automatically.

**Rejected:** Scaling requests to equipment tier only (ignoring purchased ingredients); deliberate "stretch" customers with unsatisfiable preferences.

**Rationale:** Ruling 12; direct enforcement of the hard satisfiability requirement. Tiered match floors (6.5 / 6.8 / 7.0 by unlock count) are defined in §5.6 — the PRD scoring formula cannot reach 7.0 with only the five soft-reset starters, so early palettes use proportionally simpler requests with a lower floor.

### 13.13 Gameplay Quantities — Tunable Defaults vs Load-Bearing Constants

**Decided:** Quantities stated in this PRD — ingredient count (~§10.1), equipment count (§6.3), recipe corpus size (§13.5), costs and multipliers (§6), prestige growth (§7.4, §10.1.1), and total playtime (§2, §10.2) — are **tunable defaults chosen on evidence, not contractual requirements**. They may be changed after a balance or simulation re-run without reopening product scope.

**Load-bearing (code + tests):** These are structural and require reducer/test updates, not a spreadsheet tweak:
- **3–6 ingredients per dish** — enforced by the reducer; assumed by the recipe corpus and match search (§13.6).
- **0–10 star review scale** — scoring and UI (§5, §7).
- **0–6 rating band** with start 3 / loss 0 / prestige 6 — drives prestige and soft-reset transitions (§7, §8).

**Not CI-guaranteed:** Total playtime is a design aspiration and an observed metric, not a build-time guarantee — see §10.1 pacing notes.

**Rationale:** User ruling (2026-07-24): initial numbers were rough starting points, not hard constraints.

---

## Cross-References

| Topic | Document |
|-------|----------|
| Tech stack, iPhone 17, hosting | [Tech-Stack.md](./Tech-Stack.md) |
| Client architecture, PixiJS/DOM split | [Frontend-Guidelines.md](./Frontend-Guidelines.md) |
| Domain logic, scoring code, save schema | [Backend-Guidelines.md](./Backend-Guidelines.md) |
| Implementation phases | [Plan.md](./Plan.md) |
| Progress tracker | [Progress.md](./Progress.md) |
| Known risks | [Error-Tracker.md](./Error-Tracker.md) |
| Research input (read-only) | [RESEARCH.md](./RESEARCH.md) |
