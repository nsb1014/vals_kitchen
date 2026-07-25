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
| Implementation Phase 8 — balance tuning | **Not started** |
| Implementation Phase 9 — device QA / PWA hardening | **Partial** — headless Chromium e2e (8 tests) green; real iPhone QA not done |
| Implementation Phase 10 — production deploy | **Config ready, not deployed** |

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
| 4 | PixiJS restaurant canvas | Not started | |
| 5 | Service-day loop | Not started | |
| 6 | UI screens | Not started | |
| 7 | CC0 assets | Done | Kenney CC0 tiles/furniture/customer/audio; generated 32×32 ingredient icons; CREDITS.json + audit:assets |
| 8 | Balance/tuning | Done | Analytic proxy tracks deep sim; playtime observed not gated; fast suite ~7 s |
| 9 | iPhone 17 QA | Not started | |
| 10 | Production deploy | Not started | |

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

---

## Cross-References

- Implementation plan detail: [Plan.md](./Plan.md)
- Known risks: [Error-Tracker.md](./Error-Tracker.md)
- Product requirements: [PRD.md](./PRD.md)
