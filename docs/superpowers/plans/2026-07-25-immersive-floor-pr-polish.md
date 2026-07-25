# Immersive Floor PR Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the three PR polish items (adjacency set/clear, wrong-seat deliver feedback, distinct character frames) plus doc/budget closeout so the immersive floor slice can open as a PR.

**Architecture:** Reuse existing Chebyshev helpers in `src/domain/floor/interact.ts` and store `floorPlayerGrid` for gating HUD set/clear; surface refuse feedback via a short-lived UI-only store field (not persisted); expand the characters atlas from already-vendored Kenney Tiny Dungeon tiles (no network fetch) and wire frames in `ActorLayer` with optional 2-frame bob as a walk stand-in.

**Tech Stack:** TypeScript, Vitest, PixiJS 8, existing `scripts/build-assets.ts` + Pillow pack pipeline, Zustand store.

## Global Constraints

- `createFloorDayFromCustomers(customers, tables, seats, playerPosition?)` arity must not regress to fake seats.
- CC0 only; no fabricated provenance; prefer vendored Kenney frames already on disk; generated project CC0 only if needed.
- Do not weaken tests; do not add deep sim tests to the fast suite.
- Do not edit `.cursor/plans/*`.
- Do **not** rewrite git history / squash locally — squash on GitHub merge instead.
- Node: `/home/bazzite/actions-runner/externals.2.336.0/node24/bin/node` + `node_modules/.bin/vitest`.

---

### Task 1: Adjacency-gated set / clear tables

**Files:**
- Modify: `src/domain/floor/interact.ts` — `adjacentUnsetTableIds`, `adjacentDirtyTableIds` (or placementId helpers)
- Modify: `src/store/selectors/service-day.ts` — can-set / can-clear selectors
- Modify: `src/ui/components/FloorServiceHud.ts` — only set/clear adjacent tables (replace remote set-all/clear-all, or gate buttons + filter targets)
- Test: `src/test/floor/interactions.test.ts`

**Behavior:**
- Set: only `unset` tables whose placement the player is Chebyshev-adjacent to.
- Clear: only `dirty` tables the player is adjacent to.
- Seat-next may stay remote (door line / morning flow) unless already adjacency-gated.

- [ ] **Step 1:** Failing tests for adjacent unset/dirty helpers
- [ ] **Step 2:** Implement helpers + selectors + HUD
- [ ] **Step 3:** `vitest run` green
- [ ] **Step 4:** Commit `fix(floor): adjacency-gate set and clear table actions`

---

### Task 2: Wrong-seat deliver feedback

**Files:**
- Modify: `src/store/game-store.ts` — UI-only `floorToast: string | null` + `setFloorToast` / auto-clear helper; add to `META_KEYS` so it never saves
- Modify: `src/canvas/RestaurantApp.ts` — on wrong ordered seat while carrying, set toast e.g. "Wrong table — deliver to the matching guest"
- Modify: `src/ui/components/FloorServiceHud.ts` — render toast with `data-testid="floor-toast"`
- Test: pure helper or store unit if easy; at least interaction assertion path documented in interactions test if extractable

- [ ] **Step 1:** Add toast field + META strip
- [ ] **Step 2:** Wire RestaurantApp wrong-seat + HUD display (clear after ~2s)
- [ ] **Step 3:** Tests + commit `feat(floor): wrong-seat deliver toast feedback`

---

### Task 3: Distinct guest / player frames (+ light walk cue)

**Files:**
- Modify: `scripts/build-assets.ts` — pack ≥2 additional Tiny Dungeon character tiles from `vendor/kenney/sources/tiny-dungeon/` if present (e.g. neighboring rogue/NPC tiles); update CREDITS `usedIn`
- Regenerate: `public/assets/atlases/characters.png` + `.json`
- Modify: `src/assets/loader.ts` — `getCharacterTexture(name)` already; ensure new frame names work
- Modify: `src/canvas/world/ActorLayer.ts` — player vs guest_a / guest_b frames; while `NavController` has remaining path, alternate 2 frames or bob scale as walk cue (static OK if only 1 walk frame)

**Constraints:** No kenney.nl download. If vendor lacks variants, generate 16×16 project-CC0 recolors and record honestly in CREDITS.

- [ ] **Step 1:** Inventory vendor tiles; pack ≥2 variants + optional walk frame
- [ ] **Step 2:** Wire ActorLayer selection by role/id
- [ ] **Step 3:** `vitest` + `audit:assets` if available
- [ ] **Step 4:** Commit `feat(assets): distinct floor character frames`

---

### Task 4: Doc + budget closeout

**Files:**
- Modify: `docs/Progress.md` — Phase 11 Done (slice) with measured gzip note
- Modify: `docs/Tech-Stack.md` — record measured initial JS (~173,070) and keep hard cap 280k with note that headroom remains post-slice
- Optionally tick relevant checkboxes in vertical-slice plan (optional)

- [ ] **Step 1:** Measure via `tsx scripts/check-bundle-size.ts`
- [ ] **Step 2:** Update Progress + Tech-Stack
- [ ] **Step 3:** Commit `docs: close out immersive floor slice status and measured budget`

---

## Out of scope

- Local `git rebase -i` / history squash (use PR squash-merge)
- Full walk-cycle art pack beyond available vendor frames
- iPhone QA / deep `test:sim`
