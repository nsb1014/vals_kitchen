# AAA UX Critique — Meta-Progression & Screens

**Slice:** Shop decision quality, edit/layout mode, recipe book & achievements, rating/prestige feedback, review & day-summary drama, celebration moments, long-term goal visibility, purchase actionability.  
**Method:** Blind side-by-side against **Two Point Hospital** (management-UI clarity & purchase feedback), **Stardew Valley** (progression legibility, end-of-day ritual), **Slay the Spire** (reward/goal clarity), **PlateUp!** (shop/upgrade pacing UX). Judgment based on live Playwright session (2026-08-10) plus code review of fenced presentation files.  
**Viewports exercised:** 390×844 (mobile-primary), 1280×800 (desktop).  
**Gameplay constraints respected:** No proposals to change PRD structural rules, economy formulas, prestige pacing, review/rating bands, bundle budgets, or 44px touch targets.

---

## Benchmark rationale

| Benchmark | What we borrow | Relevance to Val's Kitchen |
|-----------|----------------|----------------------------|
| **Two Point Hospital** | Purchase rows that explain *why* before *how much*, immediate post-buy feedback, upgrade trees legible at a glance | Shop is the primary meta lever (equipment gates → ingredients → layout); clarity must survive 12 equipment tiers and decor/table caps |
| **Stardew Valley** | End-of-day summary as a ritual, visible collection progress, cozy personality in reward moments | Service days alternate with meta; summary is the bridge back to shop/layout; recipe/mastery collection is the long arc |
| **Slay the Spire** | Next-reward visibility, achievement progress always readable, celebration that frames the *run goal* | Prestige at 6★ and soft reset at 0★ are run-scale stakes; achievements should telegraph the next milestone |
| **PlateUp!** | Shop during layout mode without breaking placement flow, buy-and-place continuity, pacing of unlocks | Edit mode + in-floor catalog is Val's PlateUp-equivalent; purchases should not dead-end the layout loop |

Val's removes real-time shop pressure (no rush timers). Comparisons weight **decision support, ritual satisfaction, and goal legibility** over urgency.

---

## Evidence (screenshots)

All paths under `/tmp/aaa-shots/meta/`:

| Surface | Mobile (390×844) | Desktop (1280×800) |
|---------|------------------|---------------------|
| Layout catalog shop (live path) | `shop-layout-catalog-mobile.png` | `shop-layout-catalog-desktop.png` |
| Orphan `shop` screen route (no mount) | `shop-screen-orphan-mobile.png` | `shop-screen-orphan-desktop.png` |
| Edit layout mode | `edit-mode-mobile.png` | `edit-mode-desktop.png` |
| Recipe book — Recipes tab (early) | `recipe-book-recipes-mobile.png` | `recipe-book-recipes-desktop.png` |
| Recipe book — Achievements | `recipe-book-achievements-mobile.png` | `recipe-book-achievements-desktop.png` |
| Rating HUD popover (live path) | `rating-hud-mobile.png` | `rating-hud-desktop.png` |
| Orphan `rating` screen route (no mount) | `rating-screen-orphan-mobile.png` | `rating-screen-orphan-desktop.png` |
| Customer review sheet | `review-modal-mobile.png` | `review-modal-desktop.png` |
| Day summary | `day-summary-mobile.png` | `day-summary-desktop.png` |
| Celebration banner | `celebration-mobile.png` | `celebration-desktop.png` |

**Critical runtime finding:** `navigateTo('shop')` and `navigateTo('rating')` update `data-screen` but render **blank meta chrome** because `ShopScreen.ts` and `RatingScreen.ts` are **not mounted** in `src/app/main.ts` (only Recipe Book, Settings, and Flavor Inspector modal are). Bottom nav exposes only **Floor** and **Recipe Book** (`NAV_SCREENS` in `navigation.ts`). Live shop UX is the **layout catalog sheet**; live rating UX is the **HUD detail popover**.

---

## Blind scorecard (1 = poor, 5 = excellent)

Composite benchmark column reflects the **best-of** management/progression patterns from the four reference games at comparable complexity—not a single shipped title.

| Category | Benchmark | Val's | Verdict | Evidence |
|----------|:---------:|:-----:|:-------:|----------|
| **Purchase decision support** | 5 | 3 | **Below** | Layout catalog rows show cost, gate text ("Requires Oven"), and `Buy & place` vs disabled states (`shop-items.ts`, `LayoutToolbar.ts`). Missing: comparative value (payout impact, seats/day), recommended next buy, ingredient preview of unlocked group. Locked rows are grey lists without "you need X cash / buy equipment Y first" ordering. |
| **Economy transparency** | 4 | 3 | **Below** | HUD exposes cash, rating, prestige, day persistently. Rating popover shows payout multiplier and prestige/reset distances (`ServiceDayUi.ts` HUD). Shop rows do not show **post-purchase cash** or earning rate. Full `RatingScreen` stat cards (prestige vs rating multipliers) exist in code but are unreachable in live UI. |
| **End-of-day ritual satisfaction** | 5 | 4 | **At / slightly below** | Day summary sheet blocks floor with earnings breakdown, bonuses, rating delta with before→after, unlock count, dual CTAs (`day-summary-mobile.png`). Stardew-grade structure but thin drama: no star vignette, guest highlight, or "tomorrow preview" (modifier, customer count). |
| **Review drama & feedback usefulness** | 4 | 3 | **Below** | Review sheet: guest portrait, 10-star glyphs, numeric score, tip, colored rating delta (`review-modal-mobile.png`). Useful for mechanics; weak on personality—no guest quote, archetype quip, or flavor of *why* 9.3. Modifier penalty line exists in `review-display.ts` when applicable. |
| **Long-term goal visibility** | 5 | 4 | **At** | Recipe book header `0 / 1000 (0.0%)`; achievements `0 / 25` with per-row thresholds; HUD prestige popover shows next P multiplier. Gaps: no single "run goal" strip (distance to 6★ / next equipment tier) outside HUD drill-down. |
| **Achievement appeal** | 4 | 3 | **Below** | Achievements tab: pixel badges, titles, descriptions, numeric progress (`recipe-book-achievements-mobile.png`). Locked state is uniform grey; no tier glow, family grouping, or near-complete highlighting. Celebrations enqueue on unlock (`service-events.ts`) but compete with overlays. |
| **Edit-mode ergonomics** | 4 | 4 | **At** | Done Editing + Shop, seats/grid stats, placement hints, cancel placement, catalog closes into placement (`edit-mode-mobile.png`, `LayoutToolbar.ts`). PlateUp-like buy-and-place. Shop unavailable during active day (correct). Catalog blocks notifications while open (intentional). |
| **Progress anticipation (next unlocks)** | 5 | 2 | **Below** | Equipment shop sorted by availability (`shop-items.ts`) but no "Next unlock" callout. Ingredient section in dead `ShopScreen` caps at **80 rows** (`slice(0, 80)`). No teaser for undiscovered recipe families or mastery perks at next level. |
| **Empty / early-state guidance** | 4 | 4 | **At** | Recipe tab: "Match named combos while serving customers." Achievements explain thresholds. Rating popover: "No reviews yet." Open-for-service card explains loop. Shop catalog distinguishes Buy vs Locked vs Needs equipment. |
| **Delight & personality** | 5 | 3 | **Below** | Carved-wood meta styling is cohesive (`screens.css`). Celebration banner with badge + dismiss (`celebration-mobile.png`). Ceremony modals for prestige/soft reset exist (`ServiceDayUi.ts`). Purchase SFX only when `screen === 'shop'` (`audio-bridge.ts`)—**silent buys** via layout catalog. |

**Roll-up:** Val's is **at** benchmarks on edit-mode ergonomics and early-state copy, **slightly below** on day-summary ritual and long-term counters, **clearly below** on purchase anticipation, review drama, achievement spectacle, and economy surfacing—partly because **two full screens and half the nav are orphaned code paths**.

---

## Ranked gaps (severity × player impact)

| Rank | Gap | Severity | Evidence |
|:----:|-----|----------|----------|
| 1 | **Shop & Rating full screens not mounted; nav collapsed to Floor + Recipe Book** | Critical | `main.ts` omits `mountShopScreen` / `mountRatingScreen`; orphan routes show empty panel (`shop-screen-orphan-mobile.png`). `NAV_SCREENS` = `restaurant`, `recipes` only. |
| 2 | **Purchase feedback broken on real shop path** | High | Catalog purchases occur on `restaurant` screen; `audio-bridge.ts` plays purchase SFX only when `screen === 'shop'`. No toast/row animation on buy in `LayoutToolbar`. |
| 3 | **No "what to buy next" orchestration** | High | 12 equipment gates + 100 ingredients; catalog is flat sorted lists. Benchmarks surface next milestone; Val's requires player to infer from locked rows. |
| 4 | **Review moment underplays guest fantasy** | Medium | Portrait + numbers only; archetype name shown but no voice line or preference callback (`ServiceDayUi.ts` review block). |
| 5 | **Day summary lacks forward-looking hook** | Medium | No tomorrow modifier preview, customer count, or prestige runway recap on summary sheet (data available in store). |
| 6 | **Achievements visually flat at scale** | Medium | 25 rows, identical locked treatment; progress is text-only (`achievement-status`). |
| 7 | **`ShopScreen` ingredient cap (80) if revived** | Medium | `ShopScreen.ts` `ingredientRows.slice(0, 80)` hides eligible SKUs. |
| 8 | **Rating depth buried in HUD popover** | Medium | Full bar + stat cards in `RatingScreen.ts` / `rating-display.ts` unreachable; mobile popover covers status strip (`rating-hud-mobile.png`). |
| 9 | **Celebration banner competes with primary CTAs** | Low | Banner stacks under HUD; dismiss target small; queued behind service sheets (`CelebrationBanner.ts` blocking rules). |
| 10 | **Duplicate shop implementations** | Low | `ShopScreen.ts` vs `LayoutToolbar` catalog—divergent row markup, action labels (`Buy` vs `Buy & place`), risk of future drift. |

---

## Concrete opportunities (implementable in fence)

### 1. Wire live meta surfaces — mount Shop & Rating OR fold into nav (M–L)

| | |
|---|---|
| **What** | Either (a) mount `mountShopScreen` + `mountRatingScreen` in `main.ts` and restore nav entries, or (b) delete orphan screens and promote layout catalog + HUD popover as sole surfaces with parity features. |
| **Why / player impact** | Eliminates blank routes and duplicate mental models; restores PRD "Shop" and "Rating" tabs players expect from management sims. |
| **Where** | `src/app/main.ts`; `src/store/selectors/navigation.ts` (`NAV_SCREENS`); `NavigationBar.ts`; optionally deprecate `ShopScreen.ts` / `RatingScreen.ts`. |
| **Complexity** | M (mount + nav) / L (full nav redesign with 4–6 destinations on mobile) |
| **Locked-rule risk** | No |

### 2. Purchase feedback on layout-catalog path (S)

| | |
|---|---|
| **What** | Fire purchase SFX and a brief toast ("Purchased Lemon — place from palette") when `PURCHASE` succeeds from `LayoutToolbar`; optionally pulse purchased row before close. |
| **Why** | Two Point / PlateUp purchase confirmation; fixes silent economy moment on the **only** live shop path. |
| **Where** | `src/app/audio-bridge.ts` (broaden purchase SFX condition); `LayoutToolbar.ts` purchase handler; optional `screens.css` row flash. |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 3. "Next milestone" strip on shop catalog header (M)

| | |
|---|---|
| **What** | Above catalog tabs, show one computed line: e.g. "Next: Prep Station ($450) → unlocks 8 ingredients" or "2.3★ to prestige" using existing `purchaseCost`, equipment catalog, `buildRatingDisplayModel`. |
| **Why** | Slay the Spire / PlateUp pacing clarity; reduces scan fatigue across hundreds of rows. |
| **Where** | New helper in `src/ui/presentation/shop-items.ts`; render in `LayoutToolbar.ts` `layout-catalog-header`; styles in `screens.css`. |
| **Complexity** | M |
| **Locked-rule risk** | No (display-only; uses existing costs/thresholds) |

### 4. Guest voice line on review sheet (M)

| | |
|---|---|
| **What** | Add 1–2 lines from archetype template or procedural quip keyed to match tier (e.g. high umami hunter praises/low scolds), below portrait. |
| **Why** | Stardew / Two Point charm at the highest-frequency reward moment; makes 0–10 score feel *authored*. |
| **Where** | `src/ui/presentation/review-display.ts` + archetype data or small quip table; `ServiceDayUi.ts` review template; optional `guest-portrait.ts` alt text. |
| **Complexity** | M |
| **Locked-rule risk** | No (copy only; no scoring change) |

### 5. Day summary "Tomorrow" panel (M)

| | |
|---|---|
| **What** | Footer section: expected customers, active modifier recap, prestige distance unchanged, optional "closest achievement" from `evaluate.ts`. |
| **Why** | Stardew end-of-day ritual anticipation; answers "what am I playing toward tomorrow?" |
| **Where** | `src/ui/presentation/day-summary-display.ts`; `ServiceDayUi.ts` summary template; selectors for next modifier / queue size. |
| **Complexity** | M |
| **Locked-rule risk** | No |

### 6. Achievement progress bars & near-complete styling (S)

| | |
|---|---|
| **What** | Replace plain `3 / 5` with thin bar fill on badge; gold border when ≥80% to threshold; unlocked row celebration tint already partially styled. |
| **Why** | Slay the Spire achievement legibility; makes collection tab scannable. |
| **Where** | `RecipeBookScreen.ts` `renderAchievements`; `screens.css` `.achievement-row`; reuse `achievementProgress` from `evaluate.ts`. |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 7. Unify shop row presentation (M)

| | |
|---|---|
| **What** | Single row renderer shared by `ShopScreen` and `LayoutToolbar` (title, gate, cost, action label from `shopRowActionLabel`). Remove `slice(0, 80)` or paginate. |
| **Why** | Prevents drift; ensures full ingredient catalog if full-screen shop returns. |
| **Where** | `shop-items.ts`; `ShopScreen.ts`; `LayoutToolbar.ts`. |
| **Complexity** | M |
| **Locked-rule risk** | No |

### 8. Recipe row mastery micro-bar (S)

| | |
|---|---|
| **What** | For discovered recipes, show tiny progress bar beside `Lv.N · x/y to next` from `formatMasteryProgressLabel`. |
| **Why** | Long-term mastery visibility without opening compose; PlateUp-style upgrade read. |
| **Where** | `recipe-book.ts`; `RecipeBookScreen.ts` virtual rows; `screens.css` `.recipe-mastery`. |
| **Complexity** | S |
| **Locked-rule risk** | No |

---

## Summary verdict

Val's Kitchen has **strong bones** for meta UX: cohesive chibi-wood visual language, a functional layout-catalog shop with buy-and-place, a Stardew-shaped day summary, recipe book progress counters, and a celebration queue wired to discoveries/mastery/achievements/prestige. The slice **underperforms benchmarks** primarily because **the documented Shop and Rating screens are not shipped in the live shell**, purchase delight is muted on the real buy path, and high-frequency moments (review, summary, achievements) prioritize **numbers over narrative and anticipation**.

Highest leverage fixes stay inside the fence: **restore or reconcile orphaned screens**, **fix purchase feedback on the catalog path**, and **add one "next milestone" + "tomorrow" information layer** without touching PRD economy numbers.

---

## Verification notes

- Dev server: `node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 4184 --strictPort` (stopped after capture).
- Capture harness: `/tmp/capture-meta-shots.mjs` (Playwright chromium from workspace).
- No source files modified for this critique.

---

## Implemented (round 1)

### Shipped (mapped to opportunity #s)

| # | What | Where | Tests |
|---|------|-------|-------|
| **1** | **Skipped** — mount Shop/Rating into nav shell owned by another slice next wave | — | — |
| **2** | Purchase SFX + toast/inline confirm + row flash on layout-catalog buys | `LayoutToolbar.ts`, `shop-items.ts` (`purchaseFeedbackMessage`), `screens.css` | `meta-shop-milestone.test.ts` |
| **3** | "Next milestone" strip (next equipment unlock count / prestige distance) on catalog + ShopScreen | `shop-items.ts` (`buildShopMilestoneStrip`), `LayoutToolbar.ts`, `ShopScreen.ts`, `screens.css` | `meta-shop-milestone.test.ts` |
| **4** | Guest voice line keyed by archetype + match tier; live inject into review sheet | `guest-voice.ts`, `review-display.ts`, `MetaSheetEnhancer.ts` (via `CelebrationBanner`), `guest-portrait.ts`, `screens.css` | `meta-guest-voice.test.ts` |
| **5** | Day-summary "Tomorrow" panel (expected guests, modifier, prestige distance, nearest achievement) | `day-summary-display.ts`, `achievements/nearest.ts`, `MetaSheetEnhancer.ts`, `screens.css` | `meta-tomorrow-achievements.test.ts` |
| **6** | Achievement progress bars + ≥80% near-complete gold styling | `RecipeBookScreen.ts`, `achievements/nearest.ts`, `screens.css` | `meta-tomorrow-achievements.test.ts` |
| **7** | Shared shop row description/action labels; removed ingredient `slice(0, 80)` | `ShopScreen.ts`, `shop-items.ts` (`shopRowDescription` / `shopRowActionLabel`) | covered by shop milestone tests + existing shop-items suite |
| **8** | Recipe mastery micro-bar beside discovered rows | `recipe-book.ts` (`masteryProgressRatio`), `RecipeBookScreen.ts`, `screens.css` | `meta-tomorrow-achievements.test.ts` |
| **9** | Celebration dismiss hit target ≥44px (CSS override) | `CelebrationBanner.ts`, `screens.css` | visual |
| **8 (rating polish)** | RatingScreen run-goal subtitle + nearest achievement line (screen excellence while orphaned) | `RatingScreen.ts` | — |

### Remaining gaps

- **#1** still blocked on nav/shell mount (`main.ts` / `NAV_SCREENS` / `NavigationBar`) — out of fence.
- Review/day-summary injection depends on `MetaSheetEnhancer` MutationObserver until ServiceDayUi adopts `guestVoiceLine` / tomorrow fields natively.
- **#10** full markup unification (single HTML row renderer) partially done via shared helpers; catalog vs ShopScreen still use different wrappers (`button` vs `article`).
- audio-bridge still gates purchase SFX to `screen === 'shop'`; catalog path now calls `playSfx('purchase')` directly.

### Verification (round 1)

- `npx vitest run` meta + achievements + purchase-costs + decor-purchases + phase6-screens: **pass**
- `npm run typecheck`: fence clean; out-of-fence noise in `src/test/floor-feel-hints.test.ts` (other agent)
- `npm run lint`: fence clean
- Visual: `/tmp/aaa-shots/meta-impl/` (390×844 + 1280×800) shop catalog / review / day-summary / achievements
