# Progress Tracker

**Last updated:** 2026-07-25  
**Purpose:** Living status table — not a narrative. Update as phases complete.

---

## Overall Status

| Milestone | Status |
|-----------|--------|
| Design research | **Complete** |
| Design documentation (7 docs) | **Complete** — reconciled with Rulings 7–12 |
| Implementation Phase 0 | **Done** |
| Implementation Phase 1 | **Done** |
| Implementation Phase 2 | **Done** |
| Implementation Phase 3 | **Done** |
| Implementation Phase 4 — grid + layout placement | **Done** |
| Implementation Phase 5 — service-day loop | **Done** |
| Implementation Phase 6 — UI screens | **Done** |
| Implementation Phase 7 — CC0 art + audio | **Done** — coherent Kenney tiles/furniture/customer + generated ingredient icons |
| Implementation Phase 8 — balance tuning | **Partial** — analytic proxy / prestige pacing shipped; live retune still open |
| Implementation Phase 9 — device QA / PWA hardening | **Partial** — headless Chromium e2e (8 tests) green; real iPhone QA not done |
| Implementation Phase 10 — production deploy | **Done** — Cloudflare Workers Static Assets (`vals-kitchen`) |
| Implementation Phase 11 — immersive floor service | **Done** (vertical slice) — concurrent floor service, station compose/deliver, adjacency interacts, character frames; measured initial JS gzip **173,070** / 280k cap ([design](./superpowers/specs/2026-07-25-immersive-floor-service-design.md), [plan](./superpowers/plans/2026-07-25-immersive-floor-vertical-slice.md)) |

---

## Phase / Task Table

| Phase | Task | Status | Notes |
|-------|------|--------|-------|
| — | [RESEARCH.md](./RESEARCH.md) | Done | Read-only; superseded items noted in PRD §13 |
| — | [PRD.md](./PRD.md) | Done | Rulings 7–12; equipment table §6.3; tiered satisfiability §5.6; new-game cash $500 |
| — | [Tech-Stack.md](./Tech-Stack.md) | Done | Installed versions (Vite 8.1.5, TS 5.9.3, etc.) |
| — | [Frontend-Guidelines.md](./Frontend-Guidelines.md) | Done | |
| — | [Backend-Guidelines.md](./Backend-Guidelines.md) | Done | V9 equipment partition; V5 tier floors |
| — | [Plan.md](./Plan.md) | Done | |
| — | [Error-Tracker.md](./Error-Tracker.md) | Done | |
| 0 | Project scaffolding & CI/deploy | Done | Vite 8, TS 5.9 strict, Vitest, ESLint, PWA stub |
| 0 | Directory structure per Frontend-Guidelines | Done | |
| 0 | README, index.html viewport shell | Done | |
| 1 | Ingredient master list (100) | Done | `src/data/ingredients.json` |
| 1 | Equipment gates (12) | Done | `src/data/equipment.json` |
| 1 | Recipe corpus (~1000) + generator | Done | 1000 recipes; `scripts/build-content.ts` |
| 1 | Customer request generator | Done | `src/domain/day/customer-request-generator.ts` |
| 1 | Content validators (V1–V9) | Done | Vitest + `npm run validate:content` |
| 1 | Archetypes, phrases, modifiers data | Done | archetypes + modifiers JSON |
| 2 | Domain: flavor scoring | Done | aggregate, satisfaction, match stars, recipe match |
| 2 | Domain: economy & tips | Done | costs, tips, purchases, layout helpers |
| 2 | Domain: rating, prestige, soft reset | Done | applyReview, applyPrestige, applySoftReset |
| 2 | Domain: day generation & reducer | Done | generateDay, serveCustomer, gameReducer |
| 2 | Domain: seeded RNG | Done | mulberry32 + fork + daySeed hash |
| 2 | Domain unit tests | Done | Fast suite (48 tests, ~7 s); deep sim via `npm run test:sim` |
| 3 | IndexedDB SaveRepository | Done | `src/persistence/SaveRepository.ts` |
| 3 | Save Code RS1 export/import | Done | lz-string Uint8Array + base64url + checksum |
| 3 | Corruption / backup recovery | Done | backup key + graceful load fallback |
| 3 | Mid-day resume serialization | Done | activeDay + composeDraftIngredientIds |
| 3 | navigator.storage.persist hook | Done | `requestPersistentStorage()` |
| 4 | PixiJS restaurant canvas | Done | Grid + furniture DnD + camera fit; see Overall Status |
| 5 | Service-day loop | Done | Queue serve UI + customer sprite + chat bubble |
| 6 | UI screens | Done | Floor / Shop / Flavors / Recipes / Rating / Settings + nav |
| 7 | CC0 assets | Done | Kenney CC0 tiles/furniture/customer/audio; generated 32×32 ingredient icons; CREDITS.json + audit:assets |
| 8 | Balance/tuning | Partial | Analytic proxy / prestige pacing shipped; early-game match-score retune landed 2026-07-25; further live balance open |
| 9 | iPhone 17 QA | Not started | |
| 10 | Production deploy | Done | Workers Static Assets via `wrangler.toml` (`vals-kitchen`); no `_redirects` catch-all |
| 11 | Immersive floor vertical slice | Done | FloorDay, mastery/save v2, tap-to-move, station compose/plate/deliver, adjacency set/clear/orders, wrong-seat toast, distinct character frames; gzip 173,070 |

**Status values:** `Not started` | `In progress` | `Blocked` | `Done`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-24 | RESEARCH.md completed |
| 2026-07-24 | Initial 7 design docs written |
| 2026-07-24 | PRD reconciled with Rulings 7–12 |
| 2026-07-24 | Phase 0 scaffolding complete; Phase 1 content layer + validators passing |
| 2026-07-24 | Phase 8 balance: escalating prestige pacing + long-horizon sim verified |
| 2026-07-24 | Post–Phase 5 cleanup: runtime `/data/` fetch (initial JS 157,147 B gzip), PRD §5.6 competent floor 6.75, `MOVE_ITEM` reducer action |
| 2026-07-24 | Phase 7: Kenney CC0 atlases + audio, CREDITS.json, audit:assets CI, Settings credits, lazy asset load (initial JS 171,466 B gzip) |
| 2026-07-25 | Phase 7 asset resourcing: vendored Kenney pixel stack (RPG Urban tiles, Pixel Platformer Food icons, Tiny Dungeon customer); removed ETdoFresh mirror from CI; initial JS 172,078 B gzip |
| 2026-07-25 | Generated ingredient icon set: 9 sprite sheets → `scripts/build-ingredient-icons.py` → 100×32×32 food atlas; CC0-dedicated in CREDITS; food atlas ~111 KB |
| 2026-07-25 | Doc-sync: Tech-Stack §7 + Progress Phase 4–6/10 rows aligned with Workers Static Assets deploy (no `_redirects`); Phase 8 marked Partial |
| 2026-07-25 | Immersive floor redesign approved: concurrent ¾ service, tickets≤4, set/clear, mastery; PRD/Tech-Stack/Frontend reopen; vertical-slice plan written; initial JS budget raised to 280k pending measure |
| 2026-07-25 | Phase 11 in progress: floor domain, OPEN_DAY FloorDay, station compose/take-orders/deliver, tap-to-move actors; fast suite 119; assets polish + measured budget still open |
| 2026-07-25 | Phase 11 vertical slice Done: adjacency set/clear + wrong-seat toast; distinct character frames; fast suite 126; measured initial JS gzip 173,070 (cap 280,000) |

---

## Cross-References

- Implementation plan detail: [Plan.md](./Plan.md)
- Immersive floor: [design](./superpowers/specs/2026-07-25-immersive-floor-service-design.md), [vertical-slice plan](./superpowers/plans/2026-07-25-immersive-floor-vertical-slice.md)
- Known risks: [Error-Tracker.md](./Error-Tracker.md)
- Product requirements: [PRD.md](./PRD.md)
