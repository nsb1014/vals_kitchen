# AAA Game-Feel Critique — Floor Service (Moment-to-Moment)

**Slice:** Movement/pathing, camera, interaction responsiveness, anticipation & feedback cues, seating/ordering/delivery flow clarity, actor motion, waiting-line behavior, interaction hints, service pacing readability (not scoring numbers).  
**Method:** Blind side-by-side against shipped behavior of **Overcooked! 2** (responsiveness, readable chaos, interaction feedback), **PlateUp!** (service clarity), **Dead Cells** (anticipation, easing, input buffering), **Diner Dash** (genre baseline). Judgment based on live Playwright session (2026-08-10) plus code review of fenced floor/canvas files.  
**Viewports exercised:** 390×844 (mobile-primary), 1280×800 (desktop).  
**Gameplay constraints respected:** No proposals to change PRD structural rules, economy formulas, or bundle budgets.

---

## Benchmark rationale

| Benchmark | What we borrow | Relevance to Val's Kitchen |
|-----------|----------------|----------------------------|
| **Overcooked! 2** | Instant input acknowledgment, collision-readable chaos, punchy station/guest feedback | Stress-tests whether floor actions feel *snappy* when juggling seat → order → cook → deliver |
| **PlateUp!** | Clear service-state communication, readable guest queue, “who needs what next” at a glance | Closest walkable-restaurant peer; tests whether Val's physical floor + DOM HUD communicate the same clarity |
| **Dead Cells** | Anticipation frames, eased motion, input buffering on actions | Tests whether grid locomotion feels *alive* despite no combat timers |
| **Diner Dash** | Tap-target service loop, visible waiting line, obvious next action | Genre baseline for casual service pacing without time pressure |

Val's deliberately removes patience meters and rush-hour fail states. Comparisons therefore weight **clarity, responsiveness, and feedback** over urgency, while still holding moment-to-moment floor play to benchmark-grade **readability under concurrent tasks** (unset tables + arriving guest + ticket cap).

---

## Evidence (screenshots & live notes)

All paths under `/tmp/aaa-shots/floor/`:

| Step | Mobile (390×844) | Desktop (1280×800) |
|------|------------------|---------------------|
| Boot / recipes gate | `mobile-390x844-01-boot.png` | `desktop-1280x800-01-boot.png` |
| Service start (morning gate) | `mobile-390x844-02-service-start.png` | `desktop-1280x800-02-service-start.png` |
| Guest arriving | `mobile-390x844-03-guest-arriving.png` | `desktop-1280x800-03-guest-arriving.png` |
| Seating walk | `mobile-390x844-04-seating-walk.png` | `desktop-1280x800-04-seating-walk.png` |
| Guest seated | `mobile-390x844-05-guest-seated.png` | `desktop-1280x800-05-guest-seated.png` |
| Order taken | `mobile-390x844-06-order-taken.png` | `desktop-1280x800-06-order-taken.png` |
| Carrying plate | `mobile-390x844-07-carrying-plate.png` | `desktop-1280x800-07-carrying-plate.png` |
| Delivered / review | `mobile-390x844-08-delivered.png` | `desktop-1280x800-08-delivered.png` |
| After walk | `mobile-390x844-09-after-walk.png` | `desktop-1280x800-09-after-walk.png` |

Playwright session notes: `/tmp/aaa-shots/floor/playwright-notes.txt`

**Observed rough edges during live run:**

1. **Morning gate clarity** — Service opens with banner “Set every table before guests can sit” and **Seat guest** disabled while **Set table** is active (`02-service-start`). Correct logic, but two guests appear on floor before tables are set (player + waiting NPC), which reads as “ready to seat” before the gate clears.
2. **Interaction hints absent at distance** — `getInteractHintCells()` returned `[]` throughout the run until bridge teleported player adjacent (`playwright-notes.txt`). World affordances only pulse when Val is already in service range.
3. **No visible waiting line** — Single alcove beside door; no stacked queue silhouettes despite `waitingGuestWorldPosition` supporting multi-index spacing (`waiting-line.ts`).
4. **Canvas letterboxing on mobile** — Large brown bars above/below playfield (`02`, `05`); reduces immersion vs full-bleed mobile benchmarks.
5. **Mid-flow screenshots dominated by review modal** — Bridge `advanceFloorServiceOnce` completes the loop quickly; natural walk-to-seat pacing was not captured in stills (seating wait timed out in notes while guest `isMoving: true`).
6. **Floor action bar is text-only** — Four equal-weight CTAs with no icons or stage-specific animation beyond `.primary` emphasis (`FloorServiceHud.ts`).
7. **Destination marker is subtle** — Small gold circles at path end (`ActorLayer.drawDestination`); easy to miss on wood-toned floor.
8. **Audio gap on floor actions** — Review plays `review` SFX; `FLOOR_DELIVER` does not trigger `serve` (only legacy `SERVE_DISH` in `audio-bridge.ts`). No seat/order/walk SFX.

**Code anchors corroborating feel:**

- Player `NavController` default **2 tiles/s**; guests **2.4 tiles/s** (`RestaurantApp.ts` L158, `GuestMotion.ts` L215).
- Camera `followWorldPointSmooth` lerp **0.18** (`Camera.ts` L115).
- Linear segment interpolation, no accel/decel (`NavController.update`).
- Hints gated by adjacency (`guestHintAction`, `computeInteractHints`).
- Pending seating intent auto-completes on arrival (`requestSeatNextGuest`, `completePendingSeatingIntent`).
- Doorway single-traffic owner + crop mask (`GuestMotion.refreshDoorTrafficOwner`, `doorwayGuestCropFraction`).

---

## Blind scorecard (1 = poor, 5 = excellent)

| Category | OC2 | PlateUp | Dead Cells | Diner Dash | Val's | Verdict vs benchmarks | One-line evidence |
|----------|:---:|:-------:|:----------:|:----------:|:-----:|:---------------------:|-------------------|
| **Input responsiveness** | 5 | 4 | 5 | 4 | 3 | **Below** | Tap queues A* path; no input buffer; 2 t/s walk feels leisurely vs OC instant snap (`NavController` 2 t/s). |
| **Pathing quality** | 5 | 4 | 4 | 3 | 3 | **Below** | Solid A* + mid-tile repath, but 90° grid segments with constant velocity; guests block player cells (`pathfinding.ts`, `playerBlockedGridCells`). |
| **Camera feel** | 4 | 4 | 5 | 3 | 3 | **Below** | Smooth lerp follow works (`Camera.ts` 0.18); mobile letterboxing and static scale reduce PlateUp/Dead Cells immersion (`02` mobile). |
| **Interaction affordances** | 5 | 5 | 4 | 4 | 2 | **Below** | Gold tile hints only when adjacent; text-only floor CTAs; no guest/order/deliver icons on canvas (`InteractHintLayer`, `FloorServiceHud`). |
| **Action feedback / anticipation** | 5 | 4 | 5 | 3 | 2 | **Below** | Walk cycle is 3-frame linear; no wind-up on seat/order/deliver; doorway crop is the standout polish (`GuestMotion`, `ActorLayer`). |
| **State readability under load** | 5 | 5 | 4 | 4 | 3 | **Below** | Morning gate + four CTAs help, but concurrent unset tables + arriving guest + disabled seat reads ambiguous (`02`); no icon strip on floor. |
| **Error / forgiveness handling** | 3 | 4 | 5 | 3 | 3 | **At** | Wrong-table toast, delivery retry via `PerKeyAsyncGuard`, “No clear route” toast; no bump-slide or auto-repath on block (`RestaurantApp` deliveryAttempts). |
| **Animation-transition smoothness** | 4 | 4 | 5 | 3 | 3 | **Below** | Consistent lerp + room fade (100/140 ms); segment corners are abrupt; seat snap to `seatSitWorldPosition` is clean but not eased. |
| **Audio-visual feedback coupling** | 5 | 4 | 5 | 3 | 2 | **Below** | `review` + `dayOpen` fire; floor deliver/seat/order/walk silent (`audio-bridge.ts` — `serve` only on `SERVE_DISH`). |
| **Pacing legibility (no timers)** | 4 | 5 | 3 | 4 | 3 | **Below** | Banner + emphasized CTA communicate next step; eating stage invisible on floor; no guest-stage icons (waiting vs eating vs ready-to-clear). |
| **Waiting-line behavior** | 3 | 5 | — | 5 | 2 | **Below** | Single alcove slot in practice; `WAIT_LINE_SPACING_PX` unused for entry gating (`waiting-line.ts`, `entry.ts`). |
| **Service flow clarity (seat→order→deliver)** | 5 | 5 | — | 4 | 3 | **Below** | Dual canvas tap + DOM CTAs work but split attention; must stand on canonical service cells, not just “near” guest (`guestServicePositions`). |

**Roll-up:** Val's is **at** error/forgiveness only. **Below** benchmarks on every other category. Standout positive: **doorway traffic + crop** (enter/leave) is above Diner Dash baseline. Core drag: **adjacency-gated hints + slow linear locomotion + weak action SFX/punch**.

---

## Ranked gaps (severity × player impact)

| Rank | Gap | Severity | Evidence |
|:----:|-----|----------|----------|
| 1 | World hints invisible until already in position | High | `guestHintAction` returns null unless `adjacent`; Playwright `hints: []` until teleported; OC/PlateUp show targets from across room. |
| 2 | Locomotion lacks game-feel easing / speed ramp | High | Constant `speedTilesPerMs` in `NavController`; 2 t/s player vs 2.4 guest; no anticipation on actions. |
| 3 | Floor actions have no canvas-side iconography | High | Text-only `.floor-action-label` buttons; no pulsing guest marker for “seat me” / “order ready”. |
| 4 | Audio not coupled to floor service beats | Medium | `FLOOR_DELIVER` silent; seat/order/walk have no SFX in fence (audio lives outside slice but player hears gap). |
| 5 | Waiting line reads as single guest, not a queue | Medium | One alcove anchor; multi-index world positions exist but `admitNextGuest` blocks while pipeline occupied. |
| 6 | Morning setup vs guest presence cognitive clash | Medium | Guest visible at door while **Seat guest** disabled and banner demands table setup (`02`). |
| 7 | Service positions require exact cells | Medium | `guestServicePositions` uses ±2 vertical gap; failed positioning shows toast only after tap, not pre-highlighted route endpoint. |
| 8 | Mobile canvas letterboxing reduces floor presence | Medium | `02`, `05` — playfield ~40% of vertical viewport; camera follow less impactful. |
| 9 | Destination marker too subtle | Low | 5 px gold circles (`DEST_MARKER_COLOR`); lost on parquet. |
| 10 | Interaction cues suppressed during review | Low | `selectShowFloorInteractionCues` false when `pendingReview`; correct isolation but hard cut after deliver. |

---

## Concrete opportunities (implementable in fence)

### 1. Distant “intent” hints — show route endpoint before arrival (M)

| | |
|---|---|
| **What** | When a floor action is available but Val is not in range, paint a **de-emphasized** hint on the *nearest reachable service cell* (seat alcove, guest service tile, station) and keep the pulsing hint when adjacent. |
| **Why / player impact** | PlateUp/OC players always see *where* to go; fixes “blank floor” at service start and reduces hunt-the-tile friction. |
| **Where** | `RestaurantApp.computeInteractHints` — extend to call `findShortestPathToAny` toward `waitingGuestServicePositions` / `guestServicePositions` / station adjacency; `InteractHintLayer.sync` — add `strength: 'near' \| 'far'` alpha. |
| **Complexity** | M |
| **Locked-rule risk** | No |

### 2. Locomotion juice — ease-in/out on segments + brief stop anticipation (M)

| | |
|---|---|
| **What** | Apply smoothstep (or sine) to segment `t` in `NavController.update`; optional 80–120 ms pause before `completePendingSeatingIntent` / delivery dispatch when path completes. |
| **Why / player impact** | Dead Cells–style motion sells weight; reduces “ice skating” between tiles; anticipation frames make seat/order/deliver feel intentional. |
| **Where** | `NavController.update` (segment easing); `RestaurantApp.completePendingSeatingIntent` and delivery path completion in `onTick`. |
| **Complexity** | M |
| **Locked-rule risk** | No |

### 3. Guest-stage canvas cues (order bubble / plate icon above head) (M)

| | |
|---|---|
| **What** | Small authored or Graphics cue on guest `entry.cue` when `stage === 'seated'` (order available) or `ordered` + matching carry (deliver); reuse `guestHintAction` logic. |
| **Why / player impact** | Diner Dash / PlateUp readability without reading bottom HUD; works at distance unlike tile hints. |
| **Where** | `ActorLayer.syncGuests` — draw cue from `guestHintAction` + store selectors; data from `guest-interaction-hint.ts`. |
| **Complexity** | M |
| **Locked-rule risk** | No |

### 4. Waiting-line visual staging for queued guests (S)

| | |
|---|---|
| **What** | When `stage === 'queued'`, render shadow silhouettes or dimmed portraits at `waitingGuestWorldPosition(door, index)` so the line reads before admit. |
| **Why / player impact** | Sets expectation of throughput; matches Diner Dash/PlateUp door queue fantasy. |
| **Where** | `waiting-line.ts` (`waitingGuestWorldPosition`); `ActorLayer` or lightweight `queued` pool render; domain `admitNextGuest` unchanged. |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 5. Stronger destination marker + path tail (S)

| | |
|---|---|
| **What** | Replace 5 px dots with chevron/footprint stamp at destination; optional 2–3 fading crumbs along final segment while `isMoving`. |
| **Why / player impact** | OC-style “you tapped here” feedback; helps mobile letterboxed view. |
| **Where** | `ActorLayer.drawDestination`; optional crumbs in `markerLayer` during `NavController.isMoving`. |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 6. Auto-walk CTA sync — pulse Seat/Order when path armed (S)

| | |
|---|---|
| **What** | When `pendingSeatingIntent` or path-to-guest-service is active, add `data-in-flight` on canvas mount and subtle HUD shimmer on the matching CTA until arrival or cancel. |
| **Why / player impact** | Confirms tap registered; reduces double-tap on disabled seat button during walk (`playwright-notes` seat disabled while guest moving). |
| **Where** | `RestaurantApp.pendingSeatingIntent` + `pathToGuestServiceCell`; emit via existing store toast or `service-events` patch for HUD (`FloorServiceHud` is outside fence — use `setFloorToast` null pattern or extend `service-events.ts` with `floorActionInFlight`). |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 7. Floor deliver SFX hook in presentation layer (S)

| | |
|---|---|
| **What** | Map `CUSTOMER_SERVED` reducer event to a floor deliver sting in `mapReducerEventsToUi` consumer path, or document bridge for `audio-bridge` to listen for `FLOOR_DELIVER` success (presentation-only wiring). |
| **Why / player impact** | OC serve “ding” closes the loop; currently only review audio fires after deliver. |
| **Where** | `service-events.ts` — add optional `playDeliverSting?: boolean` patch; app layer already plays `serve` on wrong action type. *Implementable signal in fence; audio trigger may need one-line app bridge outside fence.* |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 8. Camera lead-ahead while moving (S)

| | |
|---|---|
| **What** | Offset follow target by 0.5–1 tile in facing direction while `nav.isMoving`; relax to center when idle. |
| **Why / player impact** | Dead Cells / PlateUp show more space ahead of player; mitigates mobile letterbox clipping feet/path. |
| **Where** | `Camera.followWorldPointSmooth` call site in `RestaurantApp.onTick` (~L952). |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 9. Service-cell approach preview on guest tap (M)

| | |
|---|---|
| **What** | When tapping a seated/ordered guest from afar, briefly flash the chosen `guestServicePositions` cell before pathing (the cell `pathToGuestServiceCell` picks). |
| **Why / player impact** | Teaches the ±2 vertical gap rule without toast-only failure; PlateUp-style target clarity. |
| **Where** | `RestaurantApp.pathToGuestServiceCell`, `pathToWaitingGuestServiceCell`; `InteractHintLayer`. |
| **Complexity** | M |
| **Locked-rule risk** | No |

### 10. Eating / leaving stage floor readability (S)

| | |
|---|---|
| **What** | Subtle cloche or “…” cue on table while `eating`; empty-plate cue when `leaving` / dirty transition imminent. |
| **Why / player impact** | Pacing legibility without timers — player knows when clear-table will matter. |
| **Where** | `ActorLayer.syncGuests` + `FloorDay` guest `stage` / table state from sync props. |
| **Complexity** | S |
| **Locked-rule risk** | No |

---

## Summary verdict

Val's Kitchen floor service has **correct domain logic and several polished edge cases** (door traffic, pending seating intent, delivery retry guard, doorway crop). Against AAA service benchmarks it still reads as **functional prototype** rather than **juicy floor play**: locomotion is linear and slow, affordances are adjacency-locked, waiting is invisible, and action moments lack audio/visual punch. The highest-leverage improvements stay inside the fenced canvas/domain layer: **distant hints, motion easing, guest head cues, and queue staging** — without touching PRD pacing numbers or structural rules.

---

## Implemented (round 1)

### Shipped (mapped to opportunity #s)

| # | What | Where | Tests |
|---|------|-------|-------|
| **1** | Distant intent hints: far/near/preview strengths on nearest reachable service cells (tables, guests, stations, waiting seat) | `src/canvas/world/floor-feel-hints.ts`, `InteractHintLayer.ts`, `RestaurantApp.onTick` | `src/test/floor-feel-hints.test.ts` |
| **2** | Segment smoothstep easing (tile timing unchanged) + 100 ms stop anticipation before auto-seat | `NavController.ts` (`easeSegmentProgress`), `RestaurantApp.tickPendingSeatingIntent` | `src/test/floor/nav-controller.test.ts` |
| **3** | Guest head cues: order bubble / deliver plate (+ eating/leaving pacing from #10) | `guest-interaction-hint.ts`, `ActorLayer.drawGuestStageCue` | `src/test/canvas/guest-interaction-hint.test.ts` |
| **4** | Queued guests render as dim door-line silhouettes at `waitingGuestWorldPosition` | `ActorLayer.syncGuests` | `floor-feel-hints` waiting-line geometry + existing waiting-guest-anchor |
| **5** | Chevron destination stamp + 3 fading path-tail crumbs | `ActorLayer.drawDestination`, `NavController.pathTailCrumbs` | `src/test/floor-feel-destination.test.ts` |
| **6** | `data-in-flight` on canvas while seating path / walk armed | `RestaurantApp.syncFloorActionInFlightDataset` | manual/dataset; HUD shimmer still pending outside fence |
| **7** | `playDeliverSting` on `CUSTOMER_SERVED` + `sfxForFloorFeelBeat`; canvas plays serve/uiClick on deliver/seat/order/walk | `service-events.ts`, `RestaurantApp` | `floor-feel-hints` service-events cases |
| **8** | Camera lead-ahead 0.75 tile while moving | `cameraLeadOffset` + `RestaurantApp.onTick` | `floor-feel-hints` camera lead |
| **9** | Approach-preview flash on chosen service cell when pathing to guest/wait | `RestaurantApp.armApproachPreview` + hint `preview` strength | covered via hint preview path in helpers |
| **10** | Eating “…” / leaving empty-plate cues | `guestStageFloorCue` + ActorLayer | guest-interaction-hint tests |

### Remaining gaps

- **#6 HUD shimmer:** `FloorServiceHud` is outside this fence; only canvas `data-in-flight` ships. A follow-up can style CTAs from that dataset.
- **#7 audio-bridge:** `playDeliverSting` is assigned via `mapReducerEventsToUi`, but `audio-bridge.ts` (outside fence) still only plays `serve` on `SERVE_DISH`. Canvas already calls `playSfx('serve')` on successful `FLOOR_DELIVER` so the sting is audible in-play; bridge parity is a one-line follow-up.
- **Morning gate clash (#6 ranked gap):** guest visible while Seat disabled — needs domain/UI messaging changes outside fence.
- **Mobile letterboxing:** camera/layout chrome outside this wave’s safe scope beyond lead-ahead.
