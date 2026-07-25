# Error Tracker

**Last updated:** 2026-07-24  
**Purpose:** Living defect and risk log. Seed entries below are **known risks/constraints** from design research — not fabricated bugs. Update with real defects during implementation.

---

## Status Legend

| Status | Meaning |
|--------|---------|
| Open | Active risk or unresolved defect |
| Monitoring | Mitigation in place; watch during QA |
| Resolved | Fixed and verified |
| Accepted | Known limitation; won't fix for v1 |

---

## Issue Log

| ID | Date | Symptom | Root Cause | Resolution | Status |
|----|------|---------|------------|------------|--------|
| RISK-001 | 2026-07-24 | Player loses all progress after ~7 days away on Safari | iOS ITP deletes script-writable storage (IndexedDB, localStorage, SW cache) for origins without interaction for 7 days | Mitigate: `navigator.storage.persist()` on boot; Add-to-Home-Screen prompt; Save Code export/import UX. See [Tech-Stack.md §6](./Tech-Stack.md), [PRD.md §11](./PRD.md) | Open |
| RISK-002 | 2026-07-24 | Private Browsing session saves appear to work then vanish | Safari Private mode uses ephemeral storage cleared on tab/window close | Settings warning; detect ephemeral mode if possible; disable silent fail | Open |
| RISK-003 | 2026-07-24 | Initial load slow or fails on mobile data | PixiJS ~125 KB gzip + app code approaches 190 KB budget | Tree-shake PixiJS imports; lazy-load atlases/audio; CI bundle size gate. See [Tech-Stack.md §3](./Tech-Stack.md) | Open |
| RISK-004 | 2026-07-24 | Jank or frame drops during layout drag on iPhone | Mobile GPU / main-thread limits; per-frame allocations in ticker | Enforce [Frontend-Guidelines.md §8](./Frontend-Guidelines.md): ≤50 draw calls, object pooling, no DOM reads in ticker, no per-frame alloc | Open |
| RISK-005 | 2026-07-24 | Save import corrupts game or crashes boot | Schema drift, manual Save Code edits, interrupted writes | **Phase 3 mitigations implemented:** FNV-1a checksum; backup key before overwrite; versioned migrations stub; reject bad imports with clear errors; backup fallback on primary corruption. See `src/persistence/`. | Monitoring |
| RISK-006 | 2026-07-24 | Future saveVersion breaks existing players | New fields or rule changes without migration | `migrateSave()` chain + `normalizeGameState()` defaults; golden save tests; never silent migrate failure | Monitoring |
| RISK-007 | 2026-07-24 | Legal exposure from non-CC0 asset | Accidental inclusion of CC-BY or proprietary art/audio | **Phase 7 mitigations:** `public/assets/CREDITS.json` provenance manifest; `npm run audit:assets` in CI; Settings credits from manifest; Kenney CC0 only per RESEARCH §5 | Monitoring |
| RISK-008 | 2026-07-24 | Customer preference unsatisfiable at some unlock state | Content pipeline gap — preference exceeds unlocked ingredient envelope | Validator V5 + Ruling 12 generator. **Resolved for Phase 1 content** — V1–V9 passing including tiered floors 6.5/6.8/7.0 | Resolved |
| RISK-015 | 2026-07-24 | Player loses mid-day progress on mobile reload | Save schema omitted `activeDay` / compose draft | **Phase 3 implemented:** `activeDay` + `composeDraftIngredientIds` round-trip in save/load and Save Code; tested in `persistence.test.ts` | Resolved |
| RISK-016 | 2026-07-24 | Equipment bought but ingredients feel "free" | Single-gate confusion | Ruling 11 two-gate economy: equipment = shop eligibility only; ingredients still cost money | Monitoring |
| RISK-017 | 2026-07-24 | Recipe book feels wiped on soft reset | Inconsistent kept/lost lists | Ruling 9: `discoveredRecipeIds` permanent; PRD §8.3 unified; verified in soft-reset unit test | Monitoring |
| RISK-009 | 2026-07-24 | Recipe corpus licensing dispute | External dataset prose shipped | **Mitigation decided:** 100% in-house authored recipes; no TheMealDB/RecipeNLG/Food.com. See [PRD.md §13.5](./PRD.md) | Monitoring |
| RISK-010 | 2026-07-24 | Economy pacing misses 200–400h target | Flat prestige cycle length (~6 days every cycle) | **Resolved (2026-07-24):** Escalating prestige pacing via `prestigeRatingDeltaMultiplier` + capped `prestigeEconomyCostMultiplier`. Analytic proxy recalibrated to track deep sim within 15%/10%; playtime is observed metric only (sanity 20–2000 h). Fast suite + opt-in `npm run test:sim`. | Resolved |
| RISK-011 | 2026-07-24 | Dynamic Island / safe-area clips HUD or chat bubbles | Fixed viewport without `env(safe-area-inset-*)` | `viewport-fit=cover` + CSS insets on shell. See [Tech-Stack.md §4](./Tech-Stack.md) | Open |
| RISK-012 | 2026-07-24 | Double-tap zoom disrupts gameplay | Default Safari double-tap zoom on fast taps | `touch-action: manipulation` on game surface; do not use `user-scalable=no` | Open |
| RISK-013 | 2026-07-24 | PWA persist() denied silently | User never grants persistent storage | `requestPersistentStorage()` implemented; surface grant/deny in Settings (Phase 6 UI) | Monitoring |
| RISK-014 | 2026-07-24 | GitHub Pages backup ToS conflict if monetized later | GitHub Pages free tier restricts commercial/SaaS | Primary host Cloudflare Pages; GitHub as low-traffic backup only. See [Tech-Stack.md §7](./Tech-Stack.md) | Accepted |
| BUG-001 | 2026-07-24 | V5 satisfiability failures at high tier floors | Scoring neutral baseline capped achievable stars below 7.0 for single-axis requests | **Closed:** tiered floors (6.5/6.8/7.0) + witness-based customer generator; V1–V9 passing | Resolved |
| RISK-018 | 2026-07-24 | PRD §7.3 worked example base payout (72) ≠ formula at day 50 (88) | Illustrative example used wrong day index | **Resolved:** PRD §7.3 example corrected to base=88, tip=148 | Resolved |

---

## Defect Template (for implementation)

When logging real bugs, copy this row format:

```
| BUG-NNN | YYYY-MM-DD | User-visible symptom | Root cause | Fix + verification | Open/Resolved |
```

---

## Cross-References

| Topic | Document |
|-------|----------|
| Persistence mitigations | [Tech-Stack.md §6](./Tech-Stack.md), [Backend-Guidelines.md §6](./Backend-Guidelines.md) |
| Mobile perf rules | [Frontend-Guidelines.md §8](./Frontend-Guidelines.md) |
| CC0 asset policy | [PRD.md §12](./PRD.md), [RESEARCH.md §5](./RESEARCH.md) |
| Implementation QA phases | [Plan.md §Phase 9](./Plan.md) |
| Progress | [Progress.md](./Progress.md) |
