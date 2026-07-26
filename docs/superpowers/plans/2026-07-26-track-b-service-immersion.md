# Track B — Service Immersion Implementation Plan

> **For agentic workers:** Execute task-by-task. Scope fence: no shop/balance/tutorial rewrite (Track C/D).

**Goal:** Make floor service feel walkable and readable — carry plate, door line in/out, interact cues, soft camera.

**Architecture:** Presentation + light floor-sim pacing only. Keep flavor/economy kernels untouched. Prefer canvas Graphics overlays over new atlases unless a plate sprite already exists.

**Tech Stack:** PixiJS ActorLayer/Camera/PreviewLayer, floor `sim.ts`, Vitest.

## Global Constraints

- No patience meters / rush / day-clock fails.
- Fast suite green; do not weaken tests.
- CC0 only if new art; prefer Graphics for plate/highlights.
- Branch `fix/customer-scoring-spread` → merge `main` after green.

---

### Task 1: Soft camera follow

**Files:** `src/canvas/systems/Camera.ts`, optional test `src/test/canvas/camera-follow.test.ts`

- [ ] Add `followWorldPointSmooth(targetX, targetY, viewW, viewH, mapW, mapH, alpha)` that lerps `state.x/y` toward clamped ideal (alpha ~0.12–0.2 per frame).
- [ ] Keep hard `followWorldPoint` for resize/day-start.
- [ ] RestaurantApp `onTick` uses smooth follow.

### Task 2: Carry plate cue

**Files:** `src/canvas/world/ActorLayer.ts`

- [ ] When `floor.carriedTicketId`, draw a small plate disk + food dot above player head (Graphics child).
- [ ] Hide when not carrying.
- [ ] Test: pure helper or sync assertion if extractable; else visual via existing floor tests unchanged.

### Task 3: Interact adjacency highlight

**Files:** `src/canvas/layers/InteractHintLayer.ts` (new), wire in `RestaurantApp.ts`

- [ ] Each tick (service mode): highlight cells adjacent to player that are valid interacts — unset/dirty tables (set/clear), stations when ticket selected, matching guest seat when carrying.
- [ ] Soft gold/sage fill matching `--vk-accent` (~0xc4a35a).
- [ ] Clear in edit mode / no floor.

### Task 4: Door waiting line + leaving walk

**Files:** `src/domain/floor/sim.ts`, `src/domain/floor/starter-map.ts` (door helper export), `src/canvas/world/ActorLayer.ts`, tests `src/test/floor/sim.test.ts`

- [ ] On eat complete: stage `leaving` with `leaveTicksRemaining` (or reuse eatTicksRemaining) for 2 ticks while seat cleared and table dirtied when last guest leaves.
- [ ] ActorLayer: waiting guests stack at door cell with horizontal offsets; leaving guests render at door.
- [ ] `isFloorDayComplete` still requires `done` (not leaving).
- [ ] Update vertical-slice / sim tests for leaving intermediate if assertions break — **do not weaken**; extend expectations.

### Task 5: Doc-sync + ship

- [ ] Progress Track B Done; commit; push; merge main.

## Ownership fences

| Stream | Owns |
|--------|------|
| Camera | `Camera.ts`, RestaurantApp camera calls only |
| Actor cues | `ActorLayer.ts` |
| Interact hints | `InteractHintLayer.ts`, RestaurantApp wire |
| Leaving sim | `sim.ts`, floor tests |
