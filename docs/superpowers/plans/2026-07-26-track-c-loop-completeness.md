# Track C — Loop Completeness Implementation Plan

> Execute without pausing for user approval. Scope fence: no balance/mastery curve retunes (Track D).

**Goal:** Tutorial → full day → summary → shop/build → next day airtight; no dead/softlocked UI.

**Critical findings:** Mid-day `pendingReview` softlocks floor HUD; floor mutations often not autosaved; tutorial advisory-only; summary Continue doesn't route; mastery absent on summary.

## Global Constraints

- Fast suite green; do not weaken tests.
- No patience/rush.
- Parallel fence: **one owner for `game-store.ts`**.

---

### Task 1 (P0): Unblock mid-day floor reviews — OWN: ServiceDayUi + selectors

**Files:** `src/ui/components/ServiceDayUi.ts`, `src/ui/components/FloorServiceHud.ts`, `src/store/selectors/service-day.ts`, tests under `src/test/`

- [ ] When `pendingReview` and floor day still open: show **Continue service** dismiss that clears pendingReview without closing day; keep FloorServiceHud visible (or restore after dismiss).
- [ ] Close Day only when floor complete.
- [ ] Test: after FLOOR_DELIVER with more guests remaining, dismiss review → HUD actions available again.

### Task 2 (P0): Autosave floor mutations — OWN: game-store ONLY

**Files:** `src/store/game-store.ts`, `src/test/service-day-resume.test.ts` or new `src/test/floor-autosave.test.ts`

- [ ] Autosave after OPEN_DAY, all FLOOR_* actions, PLACE_ITEM / MOVE_ITEM that affect floor day.
- [ ] Hydrate: restore `floorPlayerGrid` from `activeDay.floor.playerPosition` when present; do not drop floor on load.
- [ ] Test: mutate floor → save → new store hydrate → tickets/carry/stages present.

### Task 3: Day summary Continue + mastery line

**Files:** `src/ui/presentation/day-summary-display.ts`, `ServiceDayUi.ts`, game-store summary builder (coordinate with Task 2 owner if same file — prefer Task 2 does store fields, Task 3 only UI if possible)

- [ ] Summary shows mastery delta if any recipes leveled this day.
- [ ] Buttons: **Back to floor** and **Visit shop** (set screen + dismiss summary).

### Task 4: Forced day-1 tutorial through close

**Files:** `src/domain/floor/tutorial.ts`, `FloorServiceHud.ts`, reducer/sim tutorialStep updates, `src/test/floor/tutorial.test.ts`

- [ ] Persist `tutorialStep` on FloorDay day 1; advance on successful actions; include `close` step.
- [ ] Gate buttons: disable Seat/Order/etc until prior step done (soft gate with prompt text).
- [ ] Extend tests through cook→deliver→clear→close prompts.

### Task 5: Expansion kitchen zones (if time)

**Files:** `GridLayer.ts` / starter-map expansion helper

- [ ] Expanding grid keeps kitchen columns on the right; don't wipe kitchen paint.

### Task 6: Ship

- Progress + commit + merge main.

## Ownership

| Agent | Owns | Must not |
|-------|------|----------|
| Overlay | ServiceDayUi, FloorServiceHud, service-day selectors, overlay tests | game-store.ts |
| Store | game-store.ts, persistence tests, autosave test | tutorial.ts, ServiceDayUi |
| Tutorial | tutorial.ts, tutorial tests, FloorServiceHud tutorial gating only if Overlay done first — else tutorial.ts + sim wiring only | game-store |
| Summary UI | day-summary-display.ts, ServiceDayUi summary section | game-store autosave |
