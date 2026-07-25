# Immersive Floor Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a playable vertical slice of concurrent ¾ floor service (set → seat → order → station compose → deliver → eat → clear → day end) that calls existing score/economy kernels and replaces the serial queue UI.

**Architecture:** New pure domain module `src/domain/floor/` owns seats, table lifecycle, tickets, guest stages, and day-complete rules. Pixi world is rebuilt around a ticker-driven map (nav, Y-sort, tap-to-move). DOM keeps compose sheet + HUD. `serveCustomer` stays the scoring kernel but is invoked per ticket deliver, not via `queueIndex`.

**Tech Stack:** PixiJS 8, Zustand vanilla, TypeScript 5.9, Vitest, existing Vite/PWA pipeline. No Phaser.

**Spec:** [docs/superpowers/specs/2026-07-25-immersive-floor-service-design.md](../specs/2026-07-25-immersive-floor-service-design.md)

## Global Constraints

- No patience / rage-quit timers; day ends when restaurant is clear and no dirty tables remain.
- Ticket queue max **4**; **one** plated dish carried at a time.
- Compose UI relocated to stations; equipment still gates ingredients.
- Tap-to-move pathfinding; ¾ render with logical grid underneath.
- CC0 only; CREDITS.json generated truth; project-generated art labeled as such.
- Soft reset: **keep** placed layout + recipe mastery; reset cash/rating/unlocks per existing soft-reset rules (PRD).
- Do not weaken tests to get green.
- Prefer `node node_modules/.bin/<tool>` if `npm` is missing from PATH.
- Vertical slice first: starter room, two 2-tops, one station, day-1 tutorial; expansions/4-tops after slice acceptance.

## File structure (new)

| Path | Responsibility |
|------|----------------|
| `src/domain/floor/types.ts` | GuestStage, TableState, SeatSlot, FloorTicket, FloorDay, RecipeMastery |
| `src/domain/floor/seats.ts` | Seat graph from placements; party assignment |
| `src/domain/floor/tables.ts` | set/clear/occupy transitions |
| `src/domain/floor/tickets.ts` | enqueue ≤4, select, plate, clear on deliver |
| `src/domain/floor/sim.ts` | Pure step helpers: seatWaiting, takeOrders, deliver, tickEating, tryCompleteDay |
| `src/domain/floor/pathfinding.ts` | A* on walk grid (domain-pure; canvas consumes paths) |
| `src/domain/floor/mastery.ts` | Recipe mastery level/progress + serve bonus stars |
| `src/domain/floor/starter-map.ts` | Starter room zones + default placements |
| `src/canvas/world/*` | MapLayer, ActorLayer, NavController, CameraFollow |
| `src/ui/components/FloorServiceHud.ts` | Ticket strip, carry, tutorial prompts |
| `src/test/floor/*.test.ts` | Domain floor tests |

---

### Task 1: Floor domain types + table lifecycle

**Files:**
- Create: `src/domain/floor/types.ts`
- Create: `src/domain/floor/tables.ts`
- Test: `src/test/floor/tables.test.ts`

**Interfaces:**
- Produces:
  - `export type TableSurfaceState = 'unset' | 'ready' | 'occupied' | 'dirty'`
  - `export interface FloorTable { placementId: string; state: TableSurfaceState; seatSlotCount: number }`
  - `export function setTable(table: FloorTable): FloorTable`
  - `export function clearTable(table: FloorTable): FloorTable`
  - `export function occupyTable(table: FloorTable): FloorTable`
  - `export function markDirty(table: FloorTable): FloorTable`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { clearTable, markDirty, occupyTable, setTable } from '../../domain/floor/tables.ts';
import type { FloorTable } from '../../domain/floor/types.ts';

const base = (): FloorTable => ({
  placementId: 'table_1',
  state: 'unset',
  seatSlotCount: 2,
});

describe('table lifecycle', () => {
  it('set → occupy → dirty → clear → ready', () => {
    let t = setTable(base());
    expect(t.state).toBe('ready');
    t = occupyTable(t);
    expect(t.state).toBe('occupied');
    t = markDirty(t);
    expect(t.state).toBe('dirty');
    t = clearTable(t);
    expect(t.state).toBe('ready');
  });

  it('rejects set when not unset', () => {
    expect(() => setTable({ ...base(), state: 'ready' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/.bin/vitest run src/test/floor/tables.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement types + transitions**

Implement legal transitions only: `unset→ready` (set), `ready→occupied` (occupy), `occupied→dirty` (markDirty), `dirty→ready` (clear). Throw on illegal.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/domain/floor/types.ts src/domain/floor/tables.ts src/test/floor/tables.test.ts
git commit -m "$(cat <<'EOF'
feat(floor): add table surface lifecycle state machine

EOF
)"
```

---

### Task 2: Seat graph + party assignment

**Files:**
- Create: `src/domain/floor/seats.ts`
- Test: `src/test/floor/seats.test.ts`
- Modify: `src/domain/floor/types.ts` (SeatSlot, Party)

**Interfaces:**
- Consumes: `Placement` from `src/domain/state/game-state.ts`
- Produces:
  - `export interface SeatSlot { tablePlacementId: string; slotIndex: number; x: number; y: number; facing: 0|90|180|270 }`
  - `export function seatsFromPlacements(placements: Placement[]): SeatSlot[]`
  - `export function assignPartyToTable(seats: SeatSlot[], tablePlacementId: string, partySize: number): SeatSlot[] | null`
  - For slice: `table_2seat` → 2 slots south of table cell; later `table_4seat` → 4.

- [ ] **Step 1: Failing test** — two `table_2seat` placements yield 4 seats; assign party size 2 returns both slots on one table; size 3 on 2-top returns null.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `seatsFromPlacements` + `assignPartyToTable`**

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat(floor): derive chair seats from table placements`

---

### Task 3: Tickets (max 4) + carry rule

**Files:**
- Create: `src/domain/floor/tickets.ts`
- Test: `src/test/floor/tickets.test.ts`

**Interfaces:**
- Produces:
  - `export interface FloorTicket { id: string; customerId: string; ingredientIds: string[]; status: 'open' | 'plated' | 'delivered' }`
  - `export function canEnqueue(tickets: FloorTicket[], addCount: number, max: 4): boolean`
  - `export function enqueueTickets(tickets: FloorTicket[], newTickets: FloorTicket[], max?: number): FloorTicket[]`
  - `export function plateTicket(tickets: FloorTicket[], ticketId: string, ingredientIds: string[]): { tickets: FloorTicket[]; carriedTicketId: string }`
  - `export function deliverTicket(tickets: FloorTicket[], ticketId: string): FloorTicket[]`
  - Reject second plate while any ticket is `plated`.

- [ ] **Step 1–4: TDD** enqueue caps at 4; plate sets one carried; cannot plate while carrying; deliver clears plated.

- [ ] **Step 5: Commit** `feat(floor): ticket queue with single-carry plating`

---

### Task 4: Floor day simulation + day complete

**Files:**
- Create: `src/domain/floor/sim.ts`
- Modify: `src/domain/floor/types.ts` (`FloorGuest`, `FloorDay`)
- Test: `src/test/floor/sim.test.ts`

**Interfaces:**
- Produces:
  - `export type GuestStage = 'waiting' | 'seated' | 'ordered' | 'eating' | 'leaving' | 'done'`
  - `export interface FloorGuest { id: string; customer: Customer; stage: GuestStage; seat?: SeatSlot; eatTicksRemaining: number }`
  - `export interface FloorDay { pool: FloorGuest[]; tables: FloorTable[]; tickets: FloorTicket[]; carriedTicketId: string | null; selectedTicketId: string | null; tutorialStep: string | null }`
  - `export function seatNextWaiting(day: FloorDay): FloorDay`
  - `export function takeOrdersForSeated(day: FloorDay, customerIds: string[]): FloorDay`
  - `export function beginEating(day: FloorDay, customerId: string, eatTicks: number): FloorDay`
  - `export function tickEating(day: FloorDay, dtTicks?: number): FloorDay`
  - `export function isFloorDayComplete(day: FloorDay): boolean` — all guests `done`, no waiting/seated/ordered/eating/leaving, no dirty tables, tickets empty or all delivered.

- [ ] **Step 1: Failing test** — seat from waiting onto ready table; after eat ticks leave → dirty; clear → complete when pool done.

- [ ] **Step 2–4: Implement + PASS**

- [ ] **Step 5: Commit** `feat(floor): concurrent guest stages and day-complete rule`

---

### Task 5: Wire scoring kernel on deliver (no queueIndex)

**Files:**
- Create: `src/domain/floor/deliver.ts`
- Modify: `src/domain/day/serve.ts` — extract `scoreDishForCustomer(state, customer, ingredientIds, ctx): ServeResult` used by both legacy path (temporary) and floor deliver
- Modify: `src/domain/reducer.ts` — add floor actions (or parallel `floorReducer` composed in store)
- Test: `src/test/floor/deliver.test.ts`

**Interfaces:**
- Produces:
  - `export function deliverAndScore(state: GameState, day: FloorDay, ticketId: string, ctx: DomainContext): { state: GameState; day: FloorDay; result: ServeResult }`
  - Looks up ticket + guest preference; calls scoring kernel; applies cash/rating; starts eating; does **not** use `queueIndex`.

- [ ] **Step 1: Failing test** with stub FloorDay + one ordered guest + plated ticket → cash increases, guest stage `eating`.

- [ ] **Step 2–4: Implement + keep existing `serveCustomer` tests green** (adapter: current customer path still works until UI cutover, or update those tests in Task 11).

- [ ] **Step 5: Commit** `feat(floor): deliverAndScore via existing flavor kernels`

---

### Task 6: Recipe mastery

**Files:**
- Create: `src/domain/floor/mastery.ts`
- Modify: `src/domain/state/game-state.ts` — add `recipeMastery: Record<string, { level: number; progress: number }>` ; bump `CURRENT_SAVE_VERSION` to `2`
- Modify: `src/domain/floor/deliver.ts` — on matched recipe, apply mastery + bonus stars into rating path
- Modify: `src/ui/presentation/recipe-book.ts` — show level beside dish name
- Test: `src/test/floor/mastery.test.ts`

**Interfaces:**
- Produces:
  - `export function servesToReachNext(level: number): number` — for level L (1..9), returns `L + 1` (2 serves to reach 2, …, 10 to reach 10)
  - `export function applyMasteryServe(mastery: Record<...>, recipeId: string): { mastery; level: number; leveledUp: boolean }`
  - `export function masteryBonusStars(level: number): number` — use PRD constant `MASTERY_BONUS_PER_LEVEL = 0.05` (cap contribution `level * 0.05`)

- [ ] **Step 1: Failing tests** for L1 on first serve; 2 serves to L2; bonus only when that recipe matched.

- [ ] **Step 2–4: Implement + recipe book presents `Lv.N`**

- [ ] **Step 5: Commit** `feat: per-recipe mastery levels with per-serve rating bonus`

---

### Task 7: Pathfinding (pure)

**Files:**
- Create: `src/domain/floor/pathfinding.ts`
- Test: `src/test/floor/pathfinding.test.ts`

**Interfaces:**
- Produces:
  - `export type WalkGrid = { w: number; h: number; blocked: ReadonlySet<string> }` // key `${x},${y}`
  - `export function findPath(grid: WalkGrid, from: {x:number;y:number}, to: {x:number;y:number}): {x:number;y:number}[] | null`

- [ ] **Step 1–4: TDD** path around a blocked cell; null when unreachable.

- [ ] **Step 5: Commit** `feat(floor): A* walk pathfinding`

---

### Task 8: Starter map + zone rules

**Files:**
- Create: `src/domain/floor/starter-map.ts`
- Modify: `src/domain/state/game-state.ts` — larger starter grid (e.g. 10×8), default placements for 2 tables + prep_station + door marker; `createDefaultPlacements` updated
- Modify: `src/domain/economy/purchases.ts` — `validatePlacement` checks dining vs kitchen zones when `mapZones` present
- Test: `src/test/floor/starter-map.test.ts`

**Interfaces:**
- Produces:
  - `export interface MapZones { dining: {x:number;y:number}[]; kitchen: {x:number;y:number}[]; door: {x:number;y:number} }`
  - `export function createStarterMap(): { gridSize: {w:number;h:number}; zones: MapZones; placements: Placement[] }`
  - Tables only on dining; stations only on kitchen.

- [ ] **Step 1–4: TDD zones + default two 2-tops + prep in kitchen**

- [ ] **Step 5: Commit** `feat(floor): starter full-room map with dining/kitchen zones`

---

### Task 9: Pixi world — map, player, tap-to-move

**Files:**
- Create: `src/canvas/world/MapLayer.ts`, `ActorLayer.ts`, `NavController.ts`, `CameraFollow.ts`
- Modify: `src/canvas/RestaurantApp.ts` — mount world; ticker updates nav/anims; retire old single CustomerLayer queue sync for service mode
- Modify: `src/canvas/systems/Camera.ts` — follow player + clamp
- Test: `src/test/floor/nav-controller.test.ts` (pure movement along path; keep Pixi out of unit tests)

**Interfaces:**
- Produces:
  - `NavController.setGoal(tile)`, `NavController.update(dtMs)`, `NavController.position`
  - RestaurantApp: `syncFloorDay(day: FloorDay)`, `getPlayerScreenAnchor()`, pointer → grid → setGoal / interact

- [ ] **Step 1: Unit-test NavController advances along path cells**

- [ ] **Step 2: Implement MapLayer (floor+wall placeholders OK) + ActorLayer player sprite**

- [ ] **Step 3: Wire tap-to-move in RestaurantApp**

- [ ] **Step 4: Manual smoke via `npm run dev` — player walks**

- [ ] **Step 5: Commit** `feat(canvas): tap-to-move player on starter floor map`

---

### Task 10: NPCs sit/eat/leave + table set/clear interacts

**Files:**
- Modify: `src/canvas/world/ActorLayer.ts` — customer sprites at seats
- Modify: `src/store/game-store.ts` — actions `SET_TABLE`, `CLEAR_TABLE`, `INTERACT`
- Modify: `src/ui/components/ServiceDayUi.ts` → replace with `FloorServiceHud.ts` (or rewrite in place)
- Test: `src/test/floor/interactions.test.ts` (domain interact reducer)

**Interfaces:**
- Produces store actions that call `setTable` / `clearTable` when player tile is adjacent; seat waiting when morning tables ready; take orders when adjacent to seated unordered party.

- [ ] **Step 1–4: Domain interaction tests then HUD prompts**

- [ ] **Step 5: Commit** `feat(floor): set/clear/order interactions and customer actors`

---

### Task 11: Station compose sheet + carry/deliver UI cutover

**Files:**
- Modify: `src/ui/components/ServiceDayUi.ts` / new `FloorServiceHud.ts` — ticket strip ≤4; compose sheet only at station adjacency + selected ticket
- Modify: `src/store/selectors/service-day.ts` — replace queue selectors with floor selectors
- Modify: `src/domain/reducer.ts` — remove `NEXT_CUSTOMER` from happy path (keep deprecated shim or delete + fix tests)
- Update: `src/test/service-day*.test.ts`, `src/test/persistence.test.ts` for FloorDay save shape

- [ ] **Step 1: Update persistence tests for saveVersion 2 + floor day fields**

- [ ] **Step 2: Compose opens only at station**

- [ ] **Step 3: Deliver on tap correct seat while carrying**

- [ ] **Step 4: `vitest run` fast suite green**

- [ ] **Step 5: Commit** `feat(floor): station compose and ticket strip cutover`

---

### Task 12: Day-1 tutorial + day end summary

**Files:**
- Create: `src/domain/floor/tutorial.ts`
- Modify: HUD to show blocking prompts per `tutorialStep`
- Test: `src/test/floor/tutorial.test.ts`

**Interfaces:**
- Produces: `export function nextTutorialStep(day: FloorDay): string | null` sequence `set_tables → wait_seat → take_orders → cook → deliver → clear → done`

- [ ] **Step 1–4: TDD tutorial gating**

- [ ] **Step 5: Commit** `feat(floor): day-one tutorial through full service loop`

---

### Task 13: Assets pass (slice-quality ¾)

**Files:**
- Modify: `scripts/build-assets.ts`, atlases under `public/assets/atlases/`
- Modify: `public/assets/CREDITS.json` (via generator)
- Add: generated chair/wall/player frames as project CC0 if Kenney gaps

- [ ] **Step 1: Pack deeper Kenney tiles + at least 2 customer variants + player walk cycle placeholders**

- [ ] **Step 2: `npm run build:assets` + `audit:assets`**

- [ ] **Step 3: Wire textures in MapLayer/ActorLayer**

- [ ] **Step 4: Commit** `feat(assets): ¾ slice atlases for floor actors and room`

---

### Task 14: Budgets + Progress + measure

**Files:**
- Modify: `scripts/check-bundle-size.ts` — set hard cap from measured gzip after slice build (document in Tech-Stack; planning band 250–300k until measured)
- Modify: `docs/Progress.md` — Phase 11 immersive floor slice status
- Modify: `docs/Tech-Stack.md` — camera follow, ¾, measured budget

- [ ] **Step 1: `npm run build && npm run size:check`** — record bytes

- [ ] **Step 2: Update cap + docs to measured values with headroom**

- [ ] **Step 3: Commit** `chore: raise bundle budget after immersive floor slice measure`

---

## Post-slice (not this plan)

- Dining/kitchen expansion purchases + nav rebuild
- 4-top parties
- Richer animation set / more character variety
- Remove any remaining legacy queue UI dead code
- Soft-reset mastery retention verification in sim tests

## Plan self-review

- Spec §11 vertical slice items map to Tasks 1–14.
- Mastery, tickets≤4, set/clear, day-clear complete, tap-to-move, station compose all have tasks.
- No patience timers introduced.
- Kernel reuse via `deliverAndScore` / extracted score helper — not queueIndex stretch.
