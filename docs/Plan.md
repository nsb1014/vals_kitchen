# Implementation Plan

**Status:** Design complete; implementation not started  
**Scope:** One full build (no vertical slice). See [PRD.md §13.4](./PRD.md).  
**Formula reference:** [PRD.md](./PRD.md) — do not duplicate numbers here.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Phase Dependency Graph](#2-phase-dependency-graph)
3. [Phases](#3-phases)
4. [Parallelization](#4-parallelization)
5. [Testing Strategy](#5-testing-strategy)
6. [Definition of Done](#6-definition-of-done)
7. [Cross-References](#7-cross-references)

---

## 1. Overview

Build order follows **domain-first, presentation-second**: pure logic and content validated before PixiJS/UI integration. Persistence early enough to test multi-day loops. Mobile optimization and deploy are final gates.

Estimated calendar (single agent, full-time): **8–12 weeks**. Adjust with parallel workstreams noted in §4.

---

## 2. Phase Dependency Graph

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3
                │            │           │
                │            └─────┬─────┘
                │                  ▼
                └────────────► Phase 4 ──► Phase 5 ──► Phase 6
                                      │           │
                                      └─────┬─────┘
                                            ▼
                              Phase 7 ──► Phase 8 ──► Phase 9 ──► Phase 10
```

Phases 1 (content) and 0 (scaffold) can overlap minimally at start. Phase 7 (assets) can begin once Phase 4 grid dimensions are stable.

---

## 3. Phases

### Phase 0 — Project Scaffolding & CI/Deploy

**Depends on:** Nothing  
**Parallelizable:** Yes (with Phase 1 spec finalization)

**Deliverables:**

- Vite 6 + TypeScript 5 project (`strict: true`)
- ESLint, Prettier, Vitest configured
- Directory structure per [Frontend-Guidelines.md §1](./Frontend-Guidelines.md)
- Empty domain/data/persistence/canvas/ui/store modules with barrel exports
- `vite-plugin-pwa` stub manifest
- GitHub Actions: typecheck, lint, test, build, bundle size budget (≤190 KB gzip)
- Cloudflare Pages + GitHub Pages deploy configs
- `_headers` cache rules per [Tech-Stack.md §7](./Tech-Stack.md)

**Acceptance criteria:**

- [ ] `npm run build` produces `dist/` without errors
- [ ] CI green on empty test suite
- [ ] Preview deploy loads splash on mobile viewport emulation (393×852)
- [ ] Bundle report artifact uploaded in CI

**Tests:** Smoke test — import all module entrypoints without throw.

---

### Phase 1 — Content Data: Ingredients, Flavors, Recipes, Validators

**Depends on:** Phase 0  
**Parallelizable:** Internal split — ingredients team / recipes team / validators (same phase)

**Deliverables:**

- `data/ingredients.json` — ~100 entries with 16-axis vectors
- `data/compound-affinity.json` — normalized pair bonuses
- `data/archetypes.json` — 20 customer templates
- `data/phrases.json` — descriptor phrase tables
- `data/modifiers.json` — 5–10 daily modifiers
- `data/equipment.json` — 12 kitchen equipment gates (ingredient group unlocks only)
- `data/recipes.json` — ~1000 authored recipes (3–6 ingredients each)
- `scripts/generate-recipes.ts` — template + affinity generator
- `scripts/validate-content.ts` — all V1–V9 invariants from [Backend-Guidelines.md §8](./Backend-Guidelines.md)
- CI gate: build fails on validation errors

**Acceptance criteria:**

- [ ] Validator passes with 0 errors
- [ ] Satisfiability (V5) proven for representative unlock states (starting loadout, soft reset, equipment milestones, full)
- [ ] 5 starter ingredients match [PRD.md §8](./PRD.md)
- [ ] No external recipe prose; USDA attribution string prepared
- [ ] Spot-check 20 recipes for culinary plausibility (manual)

**Tests:**

- Unit: validator rules individually (duplicate multiset, axis range, orphan)
- Property-style: random 100 preference rolls × tier sets → satisfiable combo exists
- Snapshot: recipe count ≥ 950, ingredient count 95–105

---

### Phase 2 — Pure Domain Core

**Depends on:** Phase 1  
**Parallelizable:** Submodules (flavor / economy / rating / day) in parallel

**Deliverables:**

- `domain/flavor/` — aggregate, satisfaction, match stars, recipe match
- `domain/economy/` — costs, tips, purchases
- `domain/rating/` — review delta, prestige trigger, soft reset
- `domain/day/` — customer generation, queue, modifiers
- `domain/rng/` — seeded PRNG
- `domain/reducer.ts` — `gameReducer` wiring all actions
- `domain/types.ts` — shared interfaces
- 90%+ unit test coverage on domain modules

**Acceptance criteria:**

- [ ] Golden tests match [PRD.md](./PRD.md) worked tip example (day 50, 4.2★, P2, match 8 → tip 122)
- [ ] Prestige at 6★; soft reset at 0★ with correct state wipe per PRD §8
- [ ] Any 3–6 unlocked combo produces valid match score
- [ ] Recipe bonus +0.75 applied on multiset match
- [ ] Same seed → identical customer queue

**Tests:** Vitest golden files for scoring, tips, rating movement, day generation, reducer sequences.

---

### Phase 3 — Persistence Layer + Save Codes

**Depends on:** Phase 2  
**Parallelizable:** Partially with Phase 4 (no hard dependency on canvas)

**Deliverables:**

- `persistence/SaveRepository.ts` — idb-keyval adapter
- `persistence/migrations.ts`
- `persistence/saveCode.ts` — RS1 export/import + checksum
- `persistence/backup.ts` — write-ahead backup key
- Boot hook: `navigator.storage.persist()`
- Settings UI stub for export/import (DOM minimal)

**Acceptance criteria:**

- [ ] Round-trip save → reload preserves state (Vitest + fake-indexeddb)
- [ ] Save Code export/import survives checksum validation
- [ ] Corrupt save offers backup recovery path
- [ ] Migration v1→v1 identity stable; future v2 stub tested
- [ ] Mid-day activeDay serializes and resumes

**Tests:** Round-trip, corrupt checksum rejection, backup restore, migration chain.

---

### Phase 4 — Rendering & Grid Layout System

**Depends on:** Phase 2 (domain types), Phase 3 optional for layout persistence  
**Parallelizable:** Canvas vs placement validation split

**Deliverables:**

- PixiJS 8 bootstrap (`RestaurantApp.ts`) per [Frontend-Guidelines.md](./Frontend-Guidelines.md)
- Grid renderer (16×16 @ 2× scale, 12×12 max)
- Furniture sprites from placeholder colored rects → real atlases in Phase 7
- Drag-and-drop grid-locked placement with validity feedback
- Edit layout mode toggle; store sync on drop
- World↔grid transforms; camera centering on iPhone logical width

**Acceptance criteria:**

- [ ] 60fps drag on iPhone 17 Safari ( Instruments or FPS meter ≥ 55 )
- [ ] Invalid overlaps rejected; bounds enforced
- [ ] Placements persist through save/load
- [ ] Seating capacity recalculates from table placements
- [ ] Integer pixel scaling — no blur

**Tests:** Unit tests for grid math; manual QA checklist for DnD.

---

### Phase 5 — Service-Day Gameplay Loop

**Depends on:** Phase 2, Phase 4 (restaurant view)  
**Parallelizable:** Customer bubble UI can parallel canvas queue indicator

**Deliverables:**

- Open day → generate queue → serve loop → close day
- Customer chat bubbles (DOM) with preference text
- Kitchen compose UI: pick 3–6 ingredients, serve, review 0–10 stars
- Next customer advance; day summary screen
- Rating HUD updates; prestige/soft-reset triggers
- Auto-save after day close

**Acceptance criteria:**

- [ ] Full day playable end-to-end with stub art
- [ ] Customer never mentions dish names (lint customer text generation)
- [ ] Tip matches domain `computeTip`
- [ ] Rating delta matches `(match - 5) × 0.08`
- [ ] Queue length = `customers_per_day` formula
- [ ] No timers or impatience mechanics present

**Tests:** Integration tests for reducer day flow; E2E smoke one day with Playwright mobile viewport.

---

### Phase 6 — UI Screens

**Depends on:** Phase 5  
**Parallelizable:** Screens independent (shop, inspector, recipe book, settings)

**Deliverables:**

- Ingredient flavor inspector (16-axis bars)
- Shop (ingredients, tables, grid expansion)
- Upgrades screen (12 items)
- Rating & prestige display
- Recipe book (discovered entries)
- Settings (Save Code, audio toggles, credits/attribution)
- Daily modifier banner on day open
- iOS Add-to-Home-Screen prompt after 3 days

**Acceptance criteria:**

- [ ] All screens reachable; 44px touch targets
- [ ] Inspector shows every unlocked ingredient
- [ ] Shop prices match domain cost functions
- [ ] Save Code copy/paste works on mobile Safari
- [ ] Credits list CC0 sources

**Tests:** Component tests for flavor bar rendering; manual iPhone 17 UI pass.

---

### Phase 7 — CC0 Asset Integration & Audio

**Depends on:** Phase 4 stable sprite keys; Phase 6 UI shell  
**Parallelizable:** Art atlasing || audio integration

**Deliverables:**

- Kenney atlases: Tiny Town, RPG Base, Food Expansion, Characters, UI, Audio
- Texture atlases ≤ 2048²; lazy loading
- Replace placeholder graphics
- SFX on serve, purchase, prestige; optional music loop (muted by default on mobile)
- `assets/ATTRIBUTION.md` + in-game credits
- Freesound CC0 extras if needed (per-file verification)

**Acceptance criteria:**

- [ ] Zero non-CC0 assets in bundle (audit script)
- [ ] Draw calls ≤ 50/frame in restaurant view
- [ ] Audio loads after first user gesture (iOS policy)
- [ ] Pixel art crisp at 2× scale

**Tests:** Asset manifest completeness; license audit grep.

---

### Phase 8 — Balance & Tuning Pass

**Depends on:** Phase 5–7 complete playable game  
**Parallelizable:** No — requires full loop

**Deliverables:**

- Spreadsheet/sim script projecting day 1→400 income, unlock pacing
- Tune growth rates if first prestige outside 25–40 day target ([PRD.md §10](./PRD.md))
- Tune match curve if average skilled player stuck below 3★
- Daily modifier frequency balance
- Recipe discovery rate feels rewarding not mandatory

**Acceptance criteria:**

- [ ] First prestige achievable day 25–40 (sim + 3 manual playthroughs to day 30)
- [ ] 100 ingredients reachable day 280–350 in sim at skilled play
- [ ] Prestige 10 reachable day 350–400 in sim
- [ ] No dead-end economy (cash cannot afford any progress for 10+ days at 3★)

**Tests:** Monte Carlo sim tests (headless domain) for pacing bands.

---

### Phase 9 — Mobile Optimization & iPhone 17 QA

**Depends on:** Phase 8  
**Parallelizable:** Performance || persistence QA

**Deliverables:**

- `100svh` shell, safe-area insets, Dynamic Island clearance
- `touch-action: manipulation`; no rubber-band
- Bundle ≤ 190 KB gzip verified
- PWA offline play after first load
- IndexedDB persist prompt + Save Code UX verified on real device or BrowserStack
- 7-day eviction mitigation copy in settings
- 60fps profile; fix jank hotspots

**Acceptance criteria:**

- [ ] iPhone 17 Safari (or WebKit equivalent) QA checklist 100% pass
- [ ] Lighthouse PWA installable
- [ ] No layout overflow at 390×844
- [ ] Private browsing shows warning; normal mode persists across reload
- [ ] Save Code survives copy from Notes app round-trip

**Tests:** Lighthouse CI thresholds; manual device checklist documented in Progress.md.

---

### Phase 10 — Deploy

**Depends on:** Phase 9  
**Parallelizable:** No

**Deliverables:**

- Production Cloudflare Pages deploy
- GitHub Pages backup mirror
- Optional itch.io HTML5 upload
- Version tag v1.0.0
- Final [Progress.md](./Progress.md) status update

**Acceptance criteria:**

- [ ] Public URL loads game < 2s on 4G
- [ ] Offline mode serves cached shell
- [ ] No console errors on boot
- [ ] Save/load works on production origin

**Tests:** Production smoke E2E against live URL.

---

## 4. Parallelization

| Workstream A | Workstream B | Notes |
|--------------|--------------|-------|
| Phase 0 CI scaffold | Phase 1 ingredient authoring | After day 1 of Phase 0 |
| Phase 2 flavor module | Phase 2 economy module | Same phase, different files |
| Phase 3 persistence | Phase 4 grid renderer | After Phase 2 types stable |
| Phase 6 shop UI | Phase 6 inspector UI | After Phase 5 loop |
| Phase 7 art atlasing | Phase 7 audio | Independent |
| Phase 9 perf | Phase 9 persistence QA | Same phase, different checklists |

**Critical path:** 0 → 1 → 2 → 5 → 8 → 9 → 10. Phases 3, 4, 6, 7 add width but 5 blocks on 2+4.

---

## 5. Testing Strategy

| Phase | Test Types |
|-------|------------|
| 0 | Smoke imports, build |
| 1 | Validator unit + satisfiability property tests |
| 2 | Domain golden + reducer integration |
| 3 | fake-indexeddb round-trip, save code |
| 4 | Grid math unit; manual DnD |
| 5 | Day flow integration, Playwright E2E |
| 6 | UI component, touch target audit |
| 7 | License audit, perf budget |
| 8 | Monte Carlo pacing sim |
| 9 | Lighthouse, device QA checklist |
| 10 | Production smoke |

**CI policy:** Every PR runs typecheck + lint + test + build + bundle size + content validator.

---

## 6. Definition of Done (Whole Game)

The game is **done** when all of the following hold:

1. **Playable loop:** Build → open day → serve all customers → summary → shop/layout → repeat.
2. **Content complete:** ~100 ingredients, ~1000 recipes, 12 upgrades, 20 archetypes, daily modifiers.
3. **Rules correct:** All [PRD.md](./PRD.md) formulas implemented and golden-tested.
4. **Failure/prestige:** Soft reset and prestige behave per PRD §7–§8; prestige permanent.
5. **Flavor system:** 16-axis inspector; customer bubbles never name dishes; satisfiability validated.
6. **Layout:** Grid-locked DnD for all furniture/equipment.
7. **Persistence:** IndexedDB auto-save + RS1 Save Code export/import.
8. **Mobile:** iPhone 17 Safari QA checklist pass; 44px targets; 100svh shell.
9. **Assets:** 100% CC0 with in-game attribution.
10. **Hosting:** Cloudflare Pages production live; offline PWA functional.
11. **Pacing:** Sim confirms first prestige 25–40 days; 200–400h content path credible.
12. **Docs:** [Progress.md](./Progress.md) reflects shipped state; known issues in [Error-Tracker.md](./Error-Tracker.md).

---

## 7. Cross-References

| Topic | Document |
|-------|----------|
| Product requirements | [PRD.md](./PRD.md) |
| Tech stack & iPhone 17 | [Tech-Stack.md](./Tech-Stack.md) |
| Client architecture | [Frontend-Guidelines.md](./Frontend-Guidelines.md) |
| Domain & validation | [Backend-Guidelines.md](./Backend-Guidelines.md) |
| Progress tracking | [Progress.md](./Progress.md) |
| Risks | [Error-Tracker.md](./Error-Tracker.md) |
