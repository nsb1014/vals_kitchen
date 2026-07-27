# Edit Catalog, Decor, Prestige Costs & Achievements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship edit-mode + catalog (tables/decor), prestige-flat purchase costs, celebration banners, and an Achievements tab with numbered badge icons per `docs/superpowers/specs/2026-07-27-edit-catalog-achievements-design.md`.

**Architecture:** Domain owns decor purchases, prestige-free costs, and achievement evaluation. Store queues structured celebrations. UI: hide between-day layout toolbar; + sheet in edit mode; Recipe Book tabs; banner host. Assets generated CC0 into existing atlases.

**Tech Stack:** TypeScript, Vitest, Zustand store, vanilla DOM UI, Pillow tile scripts, furniture atlas pack.

## Global Constraints

- CC0 only; generated assets recorded honestly in `CREDITS.json`.
- Do not weaken tests; fast suite only (no `test:sim` in CI path).
- Decor is cosmetic only (no match/tip bonus).
- Decor soft cap 6; table achievement max tier 8; decor achievement max tier 6.
- First recipe discover = one banner (unlock + Lv.1); no prestige cost scaling on purchases.
- Branch prefix `cursor/` suffix `-b88b`; commit/push; PR via ManagePullRequest; prefer merge to main when user asked.

## File map

| Area | Files |
|------|--------|
| Costs | `src/domain/economy/costs.ts`, `purchases.ts`, `prestige-pacing.ts` (leave tip mult), shop presentation tests |
| Decor | `scripts/build-restaurant-tiles.py`, `build-assets.ts`, `furniture-sprites.ts`, purchases + state fields |
| Edit UI | `LayoutToolbar.ts`, `service-day` selectors, `screens.css` / service-day.css |
| Celebrations | `service-events.ts`, `game-store.ts`, new `CelebrationBanner.ts` |
| Achievements | `src/domain/achievements/*`, RecipeBookScreen tabs, badge generator |
| Tests | costs, purchases, achievements, celebrations, layout visibility |

---

### Task 1: Remove prestige from purchase costs

**Files:** `src/domain/economy/costs.ts`, `purchases.ts`, `src/ui/presentation/shop-items.ts`, tests under `src/test/economy-rating.test.ts` / shop tests / prestige-pacing if cost-coupled.

- [ ] **Step 1:** Add/adjust failing test: `scaledUpgradeCost` / `canPurchase` costs equal at prestige 0 vs 5 for ingredient/equipment/table.
- [ ] **Step 2:** Run test — confirm fail if multiplier still applied.
- [ ] **Step 3:** Stop multiplying purchase costs by `prestigeEconomyCostMultiplier` (keep function for tips/docs or delete from cost path only). Annex/table/ingredient/equipment/grid all prestige-flat.
- [ ] **Step 4:** Update any golden cost assertions; run fast economy/shop tests; commit.

### Task 2: Decor domain — purchase, state, placement, soft cap

**Files:** `game-state.ts` (save migrate), `purchases.ts`, `furniture-sprites.ts`, selectors/shop, tests.

- [ ] **Step 1:** Failing tests: flat per-type cost; second buy same type same price; soft cap 6 blocks; `validatePlacement` allows decor on dining.
- [ ] **Step 2:** Add `PurchaseKind` decor; state `decorOwnedCounts` or total + per-type; wire `PURCHASE`.
- [ ] **Step 3:** Sprite map for five `decor_*` keys (assets may stub until Task 3).
- [ ] **Step 4:** Commit.

### Task 3: Generate decor sprites + pack atlas

**Files:** `scripts/build-restaurant-tiles.py`, `build-assets.ts`, `CREDITS.json`, `public/assets/atlases/furniture.*`

- [ ] **Step 1:** Implement `decor_flowers`, `decor_rug`, `decor_lamp`, `decor_sign` in same style as `decor_plant`.
- [ ] **Step 2:** Pack furniture atlas; audit:assets; honest credits.
- [ ] **Step 3:** Commit generated outputs.

### Task 4: Edit chrome + + catalog UI

**Files:** `LayoutToolbar.ts`, `ServiceDayUi.ts` / selectors, CSS, tests for visibility.

- [ ] **Step 1:** Failing test/selector: layout hud hidden between-day when not editing; visible in edit mode.
- [ ] **Step 2:** Hide `#layout-hud` between days; show in `editLayoutMode`.
- [ ] **Step 3:** Add **+** control opening catalog sheet (tables buy+place, unplaced owned, decor buy+place with prices/cap).
- [ ] **Step 4:** Shop: move Layout section above Ingredients.
- [ ] **Step 5:** Manual-path covered by unit tests on purchase→startPlacement helpers; commit.

### Task 5: Celebration queue + recipe banners

**Files:** `service-events.ts`, `game-store.ts`, new `src/ui/components/CelebrationBanner.ts`, CSS, tests.

- [ ] **Step 1:** Failing test: discover+Lv1 emits single celebration; Lv2 emits mastery celebration.
- [ ] **Step 2:** Structured queue `{ kind, title, body, ingredientIds?, achievementId?, level? }`; 4000ms auto-advance.
- [ ] **Step 3:** Mount banner host in AppShell/ServiceDayUi; render icons via `renderFoodIconHtml`.
- [ ] **Step 4:** Commit.

### Task 6: Achievements domain + badges + Recipe Book tab

**Files:** `src/domain/achievements/catalog.ts`, `evaluate.ts`, state persistence, RecipeBookScreen, badge generator script, tests.

- [ ] **Step 1:** Failing tests for catalog thresholds (tables 3/5/8, decor 1/3/6, recipes, mastery, days, prestiges) and idempotent unlock.
- [ ] **Step 2:** Implement evaluate after purchase / close day / serve events; persist ids.
- [ ] **Step 3:** Generate numbered badge icons (threshold in center, family tint); wire to UI.
- [ ] **Step 4:** Recipe Book tabs Recipes | Achievements (locked/unlocked list).
- [ ] **Step 5:** Achievement unlock pushes celebration banner.
- [ ] **Step 6:** Fast suite green; commit; push; PR; merge main if requested.

### Task 7: Docs touch

- [ ] Update `docs/Progress.md` one row for this milestone (brief).
- [ ] Note in PRD only if cost/prestige product line must change (economy §) — prefer minimal factual fix that prestige no longer scales purchase costs.

---

## Parallelism fence

| Agent | Owns | Must not |
|-------|------|----------|
| Economy | costs, purchases, shop-items, Task 1–2 domain | LayoutToolbar, RecipeBook |
| Assets | tile scripts, atlas, CREDITS, badge frames | game-store |
| UI Edit | LayoutToolbar, shop section order, celebration host shell | achievements evaluate |
| Achievements | domain/achievements, RecipeBook tabs, celebration kinds for achievements | purchases.ts after Task 2 lands |

Prefer sequential Tasks 1→2→3→4→5→6 if single agent.
