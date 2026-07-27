# Edit Catalog, Decor, Prestige Costs & Achievements — Design

**Date:** 2026-07-27  
**Status:** Approved (brainstorming lock)  
**Product:** Val's Kitchen (`vals_kitchen`)

## 1. Goals

1. Between-day Floor chrome: **Open for service?** is the only bottom prompt; hide the always-visible layout toolbar so it no longer sits under that card.
2. **Edit Restaurant** (from that card) shows edit chrome with a **+** catalog to buy/place tables and decorations, plus owned-unplaced items.
3. Generate additional **CC0 decorations** in the existing furniture style; place/move with current validation.
4. **Remove prestige multipliers from all purchase costs** — prestige only increases income (tips/payouts), not shop prices.
5. Non-blocking **celebration banners** for recipe discovery (combined with Lv.1), later mastery level-ups, and **achievements**.
6. **Achievements** browseable as a tab alongside Recipes in the Recipe Book, with cute numbered achievement icons matching the diner theme.

### Out of scope (this pass)

- Full replacement of all system-default menus with game-themed chrome (noted as a follow-up program; new surfaces in this pass should use existing `--vk-*` tokens and feel on-theme).
- 4-seat tables, multi-tile decor footprints, decor gameplay bonuses (PRD: cosmetic only).

---

## 2. Floor chrome

| State | Visible |
|-------|---------|
| Between days, Floor, not editing | Open for service? card only (no `#layout-hud` toolbar) |
| Edit mode | Done Editing + **+** catalog control + placement hints; open-for-service hidden |
| Active service day | No edit (existing locks) |

Entry: **Edit Restaurant** on the open-for-service card remains the primary edit entry.

---

## 3. + catalog (Edit mode)

Bottom sheet / panel with three groups:

1. **Buy & place — Tables**  
   - Table (2 seats) at existing table cost curve (`tableCount` index).  
   - Tap → `PURCHASE { type: 'table' }` → `startPlacement('table_2seat')`.  
   - Disabled when unaffordable.

2. **Owned, not placed**  
   - Current `selectUnplacedItems` tables/equipment chips, moved into this sheet.

3. **Buy & place — Decorations**  
   - Each type listed with flat price (see §4).  
   - Tap → purchase → `startPlacement(itemKey)`.  
   - Disabled when unaffordable or at decor soft cap.

**Shop:** Keep table (and decor) purchases; move **Layout** section **above Ingredients** so tables are discoverable.

---

## 4. Decorations

### 4.1 Assets (generated CC0, 32×48, same pipeline as `decor_plant`)

| `itemKey` | Role | Flat base cost |
|-----------|------|----------------|
| `decor_plant` | Cheap filler | $50 |
| `decor_flowers` | Cheap accent | $75 |
| `decor_rug` | Mid floor piece | $120 |
| `decor_lamp` | Mid tall piece | $150 |
| `decor_sign` | Premium accent | $200 |

- Pack into furniture atlas; map `itemKey` → sprite in `furniture-sprites.ts`.
- Record honestly in `CREDITS.json` as project-generated CC0.

### 4.2 Economy

- **Flat per type** — buying more of the same type does **not** raise that type’s price.
- **No prestige cost multiplier** (see §5).
- New purchase kind: `{ type: 'decor'; itemKey: string }` (or equivalent), tracking `decorPurchasedCounts` / total owned for achievements and soft cap.
- **Soft cap:** max **6** decor placements total (main floor). Buy disabled at cap.

### 4.3 Placement

- 1-tile footprint; reuse `validatePlacement` / `DragPlacement` / move.
- Dining-friendly (not station/kitchen-only rules); walls/occupancy still apply.
- Cosmetic only — no match/tip/ambiance bonus (PRD Ruling 7).

---

## 5. Prestige and purchase costs

**Change:** Remove `prestigeEconomyCostMultiplier` from all purchase cost paths (ingredients, equipment, tables, grid expansion, kitchen annex, and new decor).

**Keep:** Prestige still increases tip/payout income (`prestigeMultiplier` on tips) and rating-delta resistance.

**Tests:** Update any assertions that assumed prestige-inflated shop prices; keep income-side prestige tests.

---

## 6. Celebration banners

### 6.1 Behavior

- Non-blocking top/overlay toast (~**4 seconds**), FIFO queue, one visible at a time.
- Slide/fade using existing warm diner tokens (not system alerts).

### 6.2 Recipe events

| Event | Banner |
|-------|--------|
| First discovery (+ Lv.1 mastery) | **One** banner: recipe name, ingredient icons, “New recipe unlocked · Mastery Lv.1” |
| Later mastery level-up (Lv.2+) | “Mastery up! Lv.N” + icons + name |

No double banner on first unlock.

### 6.3 Achievement events

When a milestone unlocks → achievement banner (icon + title + short line). Same queue as recipe banners.

### 6.4 Hook

Extend reducer UI mapping (`service-events` / store meta) with a structured `celebrationQueue` (or equivalent). Do not overload string-only `floorToast`.

Icons for recipes: `renderFoodIconHtml` on `recipe.ingredientIds` (no per-recipe art).

---

## 7. Achievements

### 7.1 Persistence

- `unlockedAchievementIds: string[]` (or map with unlockedAt day) on save state; migrate with default `[]`.
- Evaluate after relevant mutations (recipe discover/mastery, decor purchase, table purchase, close day, prestige).

### 7.2 Starter milestones (space-aware where needed)

| Family | IDs / thresholds | Notes |
|--------|------------------|-------|
| Recipes unlocked | 1, 5, 10, 25, 50, 100 | Corpus-scale |
| Recipes at mastery ≥5 | 1, 5, 10 | |
| Recipes at mastery 10 | 1, 3, 5 | |
| Decorations purchased | **1, 3, 6** | Soft cap 6 |
| Tables owned | **3, 5, 8** | Practical max ~8 at 12×12 |
| Days completed | 1, 7, 14, 30 | |
| Prestiges | 1, 3, 5 | |

### 7.3 Browse UI

- Recipe Book gains tabs: **Recipes | Achievements**.
- List: locked (muted + progress toward next) vs unlocked (check + title).
- No new bottom-nav item.

### 7.4 Achievement icons

- Generated **cute diner-themed badge** sprites (project CC0): circular/plaque frame matching walnut/cream/sage palette.
- **Number (threshold) drawn in the center** of the icon (e.g. “5”, “10”).
- Family tint or small corner glyph optional (leaf for decor, star for mastery, table glyph for tables) — keep readable at ~40–48 CSS px.
- Pipeline: generate in `scripts/build-restaurant-tiles.py` or a small sibling script → pack or ship as UI atlas frames; prefer same pixel style as furniture.

---

## 8. Architecture sketch

```
domain/economy     — decor purchase, costs without prestige mult
domain/achievements — catalog + evaluateUnlocks(state) → new ids
store              — celebrationQueue, apply on events / purchases
ui/LayoutToolbar   — hide between-day; + sheet in edit mode
ui/RecipeBook      — Recipes | Achievements tabs + badge icons
ui/CelebrationBanner — queue renderer
scripts            — decor sprites + achievement badge frames
```

---

## 9. Testing

- Selectors: open-for-service / layout-hud visibility vs edit mode.
- Decor purchase flat price; soft cap; placement validate.
- Prestige does not change ingredient/equipment/table costs.
- Discovery → single celebration; mastery Lv.2+ → separate.
- Achievement evaluate: thresholds; tables/decor caps; persistence round-trip.
- Fast suite green; no weakening of existing assertions.

---

## 10. Follow-ups (explicitly later)

- Game-themed restyle of Shop / Flavors / Settings / nav (replace remaining system-default look).
- More achievement families / badge variants.
- Optional 4-top tables.
