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

---

## Re-verification (round 1)

**Method:** Fresh blind re-run 2026-08-10 — `npm run sync:data`, Vite dev on `127.0.0.1:4181/?e2e=1`, Playwright Chromium driving UI clicks (set table → seat → take orders) plus one bridge cook/deliver step. Code re-read of fenced floor/canvas files. Scores judged from live evidence only; prior scorecard not used as anchor.

**Evidence:** `/tmp/aaa-shots/floor-verify/` — `playwright-notes.txt` plus mobile 390×844 and desktop 1280×800 stills (`01-boot` … `11-queued-line`).

**Verified improvements (live):**

| Claim | Evidence |
|-------|----------|
| Distant intent hints | `getInteractHintCells()` returns 2 cells at service start (unset tables) and 1 at seat alcove `(3,5)` before walk; yellow far rings visible in `02-service-start`, `03-guest-waiting`, `04-tables-set` |
| Guest head cues | Order `!` bubble above seated guest in `06-guest-seated`; deliver sparkles on player in `09-delivered-review` |
| Queued silhouettes | Three dim door-line ghosts in `desktop-1280x800-03-guest-waiting` and `mobile-390x844-03-guest-waiting` |
| Chevron destination + crumbs | Facing chevron stamp at path end in `05-seating-walk`, `07-order-taken` |
| Segment easing | `NavController.easeSegmentProgress` smoothstep applied to visual lerp (tile timing unchanged) |
| Camera lead-ahead | `cameraLeadOffset(0.75 tile)` in `RestaurantApp.onTick` |
| Floor SFX | `RestaurantApp` plays `serve` on `FLOOR_DELIVER`, `uiClick` on seat/order/walk; `audio-bridge` emits visual juice on `playDeliverSting` |
| Canvas presence | Playfield ~84% mobile / 80% desktop viewport height (vs ~40% in original run) |

**Not verified / partial:**

| Claim | Finding |
|-------|---------|
| `data-in-flight` CTA sync | Attribute lives on `app.canvas.dataset.inFlight`, not `#canvas-mount`; seat click often instant-dispatches when Val is already in range (`requestSeatNextGuest` L611–614), so in-flight never observed in Playwright |
| HUD shimmer (#6) | Still absent — `FloorServiceHud.ts` unchanged |
| Take orders via CTA alone | UI click left guest `seated` in bridge state; order stage requires adjacency walk — friction remains |
| Morning gate clash | Guest + queued silhouettes visible while banner demands table setup (`02`, `03`) |

---

### Blind scorecard (re-scored)

| Category | OC2 | PlateUp | Dead Cells | Diner Dash | Val's | Verdict vs benchmarks | One-line evidence |
|----------|:---:|:-------:|:----------:|:----------:|:-----:|:---------------------:|-------------------|
| **Input responsiveness** | 5 | 4 | 5 | 4 | 3 | **Below** | Tap still queues A* at default 2 t/s; no input buffer; adjacent seat skips walk entirely. |
| **Pathing quality** | 5 | 4 | 4 | 3 | 3 | **Below** | Smoothstep eases visual lerp but 90° segments and constant tile timing unchanged; guests still block cells. |
| **Camera feel** | 4 | 4 | 5 | 3 | 4 | **Below** | Lead-ahead + taller canvas mount (84%/80% viewport) lift immersion; still static scale vs Dead Cells parallax. |
| **Interaction affordances** | 5 | 5 | 4 | 4 | 4 | **Below** | Far/near tile hints + head bubbles readable at distance (`06`); floor CTAs remain text-only labels. |
| **Action feedback / anticipation** | 5 | 4 | 5 | 3 | 3 | **Below** | 100 ms stop-hold before auto-seat exists in code but imperceptible when seat fires in-place; doorway crop still best polish. |
| **State readability under load** | 5 | 5 | 4 | 4 | 3 | **Below** | Head cues help, but morning gate + visible waiting guest + disabled seat logic still ambiguous (`02`–`03`). |
| **Error / forgiveness handling** | 3 | 4 | 5 | 3 | 3 | **At** | Wrong-table toast, delivery retry guard, route-fail toast — unchanged and adequate. |
| **Animation-transition smoothness** | 4 | 4 | 5 | 3 | 4 | **Below** | Smoothstep segments + room fade; corner pivots still snap; seat snap clean but not eased. |
| **Audio-visual feedback coupling** | 5 | 4 | 5 | 3 | 3 | **Below** | Deliver `serve` sting + review juice land; seat/order/walk use quiet `uiClick` — thin vs OC serve ding. |
| **Pacing legibility (no timers)** | 4 | 5 | 3 | 4 | 4 | **Below** | Order bubble + eating/leaving dots + banner copy communicate stages; eating still easy to miss at zoom. |
| **Waiting-line behavior** | 3 | 5 | — | 5 | 4 | **Below** | Three queued silhouettes stage the door line (`03`); admit still single-slot — throughput fantasy incomplete. |
| **Service flow clarity (seat→order→deliver)** | 5 | 5 | — | 4 | 4 | **Below** | Far hints + chevron reduce hunt-the-tile; dual canvas tap + DOM bar + exact service cells still split attention. |

**Roll-up:** Val's remains **at** error/forgiveness only. Round-1 polish closes the largest readability gaps (distant hints, head cues, queue silhouettes, destination stamp, taller canvas) but **does not reach AAA parity** on responsiveness, feedback punch, or service-state clarity under the morning gate.

---

### Overall verdict

**Does the slice now meet or exceed the AAA benchmark in a blind side-by-side?** **No.** Against Overcooked! 2 / PlateUp! the floor slice reads as a **clearly improved functional service loop** — players can see where to go and what guests need without standing on the tile first — but locomotion still feels leisurely, action moments lack benchmark punch, and the setup gate still fights the visible guest at the door. Standout win: **distance-readable intent** (tile hints + head cues + queue silhouettes) is now above the original Diner Dash baseline. Standout remaining drag: **speed/input buffer** and **text-only floor chrome**.

---

### Remaining gaps (ranked by player impact)

| Rank | Gap | Where | Complexity |
|:----:|-----|-------|:----------:|
| 1 | Locomotion still 2 t/s with no input buffer — feels sluggish vs OC snap | `NavController.ts` constructor default; `RestaurantApp` nav init | M |
| 2 | Floor action bar text-only — no icons or in-flight shimmer on matching CTA | `FloorServiceHud.ts` (read `canvas.dataset.inFlight`) | M |
| 3 | Morning setup banner vs visible waiting guest cognitive clash | `domain/floor/tutorial.ts`, `FloorServiceHud.ts` banner copy | M |
| 4 | Take-order / deliver still require exact service-cell adjacency; CTA tap alone insufficient | `guestServicePositions` in `interact.ts`; `RestaurantApp.pathToGuestServiceCell` | M |
| 5 | Seat dispatches instantly when already in range — skips walk, crumbs, `data-in-flight` | `RestaurantApp.requestSeatNextGuest` L611–614 | S |
| 6 | Head cues are procedural Graphics, not authored icons — readable but not PlateUp-grade | `ActorLayer.drawGuestStageCue` | M |
| 7 | Seat/order SFX use generic `uiClick` — weak emotional closure vs deliver `serve` | `service-events.sfxForFloorFeelBeat`, `RestaurantApp` play sites | S |
| 8 | Single-slot admit — silhouettes promise a line throughput the domain still blocks | `domain/floor/entry.ts` `admitNextGuest` | L |

---

## Implemented (round 2)

### Shipped

| # | What | Where | Tests |
|---|------|-------|-------|
| **1** | Mid-walk destination buffer: taps queue a goal cell; on path end, repath seamlessly from arrival. Corner/turn forgiveness: mid segments use linear lerp (no smoothstep full-stop); first/last still ease. Walk tiles/sec unchanged. | `NavController.ts` (`bufferGoal`, `easeSegmentProgress` roles), `RestaurantApp.setNavigationPath` / `flushBufferedNavigationGoal` | `src/test/floor/nav-controller.test.ts`, `src/test/floor-feel-round2.test.ts` |
| **2** | In-range seat anticipation: when already adjacent, arm pending seating intent with 200 ms presentation hold instead of instant `FLOOR_SEAT_NEXT` snap | `RestaurantApp.requestSeatNextGuest`, `IN_PLACE_SEAT_ANTICIPATION_MS` | covered by seating intent path; hold is presentation-only |
| **3** | Speech bubble mouth anchor: screen-space head/mouth from content bounds (fallback feet + draw-scale top), correct under camera follow/zoom | `actor-mouth-anchor.ts`, `RestaurantApp.getGuestScreenAnchor` / `getCustomerScreenAnchor` | `src/test/floor-feel-round2.test.ts` |
| **4** | Canvas keyboard movement: playfield `tabIndex=0` + aria-label, focus ring, pointer focus handoff; WASD moves even when floor toolbar steals arrow `preventDefault` | `RestaurantApp.create` / `onKeyboardMove` / `onCanvasFocusChange` | manual/a11y; toolbar file untouched |
| **5** | Morning-gate copy names the visible door guest and the set-tables → seat order | `tutorial.ts` `tutorialPrompt('set_tables')` | `tutorial.test.ts`, `floor-feel-round2.test.ts` |

### Still out of fence / deferred

- Floor HUD shimmer from `data-in-flight` (`FloorServiceHud.ts`)
- Exact service-cell adjacency rules (`guestServicePositions`)
- Audio-bridge `SERVE_DISH`-only parity

---

## Final verification (round 2)

**Method:** Fresh blind re-run 2026-08-10 — `npm run sync:data`, Vite dev on `127.0.0.1:4181/?e2e=1`, Playwright Chromium (UI taps + `window.__E2E__` bridge). Code cross-check of round-2 fence files. Scores from live evidence only; prior scorecards not used as anchors.

**Evidence:** `/tmp/aaa-shots/floor-final/` — `playwright-notes.txt`, `results.json`, mobile 390×844 and desktop 1280×800 stills (`01-boot` … `08-order-bubble`).

**Locked-rule audit:** Player `NavController` default **2 tiles/s** (`NavController.ts` L70); guests **2.4 tiles/s** (`GuestMotion.ts` L215). No PRD gameplay-number changes detected.

### Verified improvements (live)

| Claim | Evidence |
|-------|----------|
| Mid-walk destination buffer | Tap `(3,4)` while moving from `(7,5)`; mid-walk retap to `(5,6)`; player arrives `(5,6)` without dead input (`03-midwalk-buffer`, `results.json` `midWalkBuffer`) |
| Corner forgiveness | Code: `easeSegmentProgress` `mid` role returns linear `x` (`NavController.ts`); path completes cleanly after buffer repath |
| In-place seat anticipation | Adjacent **Seat guest**: guest stays `waiting` + `pendingSeatingIntent` + `data-in-flight="seat"` for ≥150 ms before `seating` (`05-inplace-seat`, `inPlaceSamples`) |
| Mouth/head bubble anchors | Standing + seated: `mouthInHeadBand`, `anchorAboveTorso`, `anchorNotAtFeet` on both viewports (`04-standing-guest`, `06-seated-bubble`); ordered bubble tail X within 0.01 px of `getGuestScreenAnchor` (`08-order-bubble`) |
| Canvas keyboard | `tabIndex=0`, aria-label, gold `3px` focus ring; Tab-to-canvas + `d` moves `(4,5)→(5,5)` (`07-keyboard`, extra Tab pass) |
| Morning-gate copy | Banner: *"Guest at the door — set every table first, then you can seat them."*; **Seat guest** disabled (`02-service-start`) |

**Partial / not verified in natural flow:**

| Claim | Finding |
|-------|---------|
| Order bubble in seat→order CTA path | Main run: bubble `visible:false` after take-orders click without guaranteed service-cell adjacency; fixture path confirms tail math (`08-order-bubble`) |
| Keyboard without Tab | `canvas.focus()` alone lost focus before keypress in mobile run; Tab roving through floor chrome required on desktop |
| HUD shimmer | Still absent — `FloorServiceHud.ts` unchanged |

---

### Blind scorecard (re-scored)

| Category | OC2 | PlateUp | Dead Cells | Diner Dash | Val's | Verdict vs benchmarks | One-line evidence |
|----------|:---:|:-------:|:----------:|:----------:|:-----:|:---------------------:|-------------------|
| **Input responsiveness** | 5 | 4 | 5 | 4 | **4** | **Below** | Mid-walk tap buffers to `(5,6)` without dropped input; 2 t/s walk still leisurely vs OC snap. |
| **Pathing quality** | 5 | 4 | 4 | 3 | **3** | **Below** | Buffer repath works; mid-segment linear corners reduce pivot stall but 90° grid + guest blocking unchanged. |
| **Camera feel** | 4 | 4 | 5 | 3 | **4** | **Below** | Lead-ahead + ~84% mobile / ~80% desktop canvas fill; static scale vs Dead Cells parallax. |
| **Interaction affordances** | 5 | 5 | 4 | 4 | **4** | **Below** | Far hints at service start (`(3,3)`, `(4,3)`); floor CTAs still text-only labels. |
| **Action feedback / anticipation** | 5 | 4 | 5 | 3 | **4** | **Below** | 200 ms in-place seat hold + `data-in-flight` readable; deliver/serve punch still thin vs OC. |
| **State readability under load** | 5 | 5 | 4 | 4 | **4** | **Below** | Morning banner names door guest; silhouettes + disabled seat still coexist at open. |
| **Error / forgiveness handling** | 3 | 4 | 5 | 3 | **3** | **At** | Wrong-table toast, delivery retry guard, route-fail toast — unchanged. |
| **Animation-transition smoothness** | 4 | 4 | 5 | 3 | **4** | **Below** | Smoothstep ends + linear mid-segments; seat snap after hold still not eased. |
| **Audio-visual feedback coupling** | 5 | 4 | 5 | 3 | **3** | **Below** | Deliver `serve` + review juice; seat/order/walk still quiet `uiClick`. |
| **Pacing legibility (no timers)** | 4 | 5 | 3 | 4 | **4** | **Below** | Order bubble + head cues + clarified banner; eating dots easy to miss at mobile zoom. |
| **Waiting-line behavior** | 3 | 5 | — | 5 | **4** | **Below** | Door silhouettes stage queue (`02`); admit remains single-slot. |
| **Service flow clarity (seat→order→deliver)** | 5 | 5 | — | 4 | **4** | **Below** | Buffer + hints reduce hunt; dual canvas/HUD + exact service cells still split attention. |

**Roll-up:** Val's remains **at** error/forgiveness only. Round 2 closes responsiveness gaps (input buffer, in-place anticipation, mouth anchors, keyboard path, morning copy) but **does not reach AAA parity** on locomotion speed, feedback punch, or HUD chrome.

---

### Overall verdict

**Does the slice now meet or exceed the AAA benchmark in a blind side-by-side?** **No.** Against Overcooked! 2 / PlateUp! the floor reads as a **materially tighter service loop** — buffered taps, readable mouth-anchored bubbles, and a less ambiguous morning gate — but 2 t/s grid walk, text-only floor bar, and weak action SFX keep it below benchmark snap and punch. Standout win: **mid-walk input buffer + mouth-anchored speech bubbles**. Standout remaining drag: **locomotion pace (locked)** and **floor HUD iconography/shimmer**.

---

### Remaining gaps (ranked by player impact)

| Rank | Gap | Where | Complexity |
|:----:|-----|-------|:----------:|
| 1 | Floor action bar text-only — no icons or `data-in-flight` CTA shimmer | `FloorServiceHud.ts` | M |
| 2 | Locomotion still 2 t/s — feels sluggish vs OC (PRD-locked) | `NavController.ts` default | — |
| 3 | Take-order / deliver require exact service-cell adjacency; CTA alone insufficient | `guestServicePositions` in `interact.ts` | M |
| 4 | Keyboard play requires Tab through chrome before WASD on desktop | `RestaurantApp` focus + `FloorServiceHud` roving tabindex | S |
| 5 | Seat/order SFX use generic `uiClick` — weak vs deliver `serve` | `service-events.sfxForFloorFeelBeat` | S |
| 6 | Single-slot admit — silhouettes promise throughput domain blocks | `domain/floor/entry.ts` `admitNextGuest` | L |
| 7 | Order bubble tail only verified via fixture; natural CTA path needs adjacency walk | `ServiceDayUi.ts` + `guestServicePositions` | S |

---

## Implemented (round 3)

### Shipped (single focus: adjacency friction → approach-and-complete)

| # | What | Where | Tests |
|---|------|-------|-------|
| **1** | Unified presentation-layer approach intent for **seat / order / deliver / set / clear / compose**: far tap paths Val to the nearest legal service/adjacent cell, keeps distant preview + `data-in-flight` armed en route, then auto-dispatches on arrival after the existing stop-anticipation hold. Domain proximity enforcement unchanged. | `src/canvas/world/approach-intent.ts` (new), `RestaurantApp.ts` (`beginApproachOrAct`, `tickPendingApproachIntent`, `completePendingApproachIntent`) | `src/test/floor-feel-round3.test.ts` |
| **2** | Sustained pending-approach preview (not only the brief flash) so the chosen service cell stays explicit for the whole walk | `floor-feel-hints.ts` `pendingApproach`, `RestaurantApp` hint sync | round3 preview case + existing hint tests |
| **3** | Clear cancel: tap elsewhere still replaces the armed approach; **Escape** cancels the pending approach and aborts its walk; keyboard move / door / wrong-target keep prior cancel semantics | `RestaurantApp.onTapMove`, `onKeyboardMove` | covered by retain/cancel logic in approach-intent + existing seating cancel paths |
| **4** | Guidance comment on locked `guestServicePositions` pointing at canvas approach-and-complete (no enforcement change) | `interact.ts` | — |

### Out of scope (per round-3 brief)

- Walk speed 2 t/s (PRD-locked)
- Floor HUD CTA presentation / shimmer (`FloorServiceHud.ts` — concurrent agent)

### Verify

- `npx vitest run src/test/floor src/test/canvas src/test/floor-feel-*` — green (254 tests)
- Visual: `/tmp/aaa-shots/floor-r3/` — far seat-cell tap from `(7,5)` armed `order` approach to `(1,4)`, `data-in-flight="order"` en route, auto-`FLOOR_TAKE_ORDERS` on arrival (`05-auto-complete`); Escape and tap-elsewhere cleared the armed intent (`06`/`07`, `results.json`)

---

## Closing verification (round 3)

**Method:** Fresh blind re-run 2026-08-10 — `npm run sync:data`, Vite dev on `127.0.0.1:4181/?e2e=1`, Playwright Chromium (`/tmp/aaa-shots/floor-close/verify.mjs` + spot checks). Code cross-check of `approach-intent.ts` / `RestaurantApp` fence. Scores from live evidence only; prior scorecards not used as anchors.

**Evidence:** `/tmp/aaa-shots/floor-close/` — `playwright-notes.txt`, `results.json`, mobile 390×844 and desktop 1280×800 stills (`01-boot` … `12-delivered`, `14`–`18`). Cancel paths corroborated from `/tmp/aaa-shots/floor-r3/results.json` (same build).

**Locked-rule audit:** Player **2 tiles/s**, guests **2.4 tiles/s**; `guestServicePositions` adjacency enforced at dispatch — approach-and-complete is presentation-only walk-then-act.

### Verified improvements (live)

| Claim | Evidence |
|-------|----------|
| Far-tap **set** auto-complete | From `(7,5)` tap unset table `(2,2)` → `approach.kind=set`, `destination (3,3)`, `data-in-flight="set"` for full walk → table `ready` (`04-set-enroute`, `05-set-complete`, `results.json` `set`) |
| Far-tap **seat** auto-complete | After tables set, **Seat guest** CTA from `(7,5)` → `approach.kind=seat`, `destination (3,5)`, `inFlight=seat` en route → guest leaves `waiting` (`06-seat-enroute`, `07-seat-complete`) |
| Far-tap **order** auto-complete | `prepareFourFacingSeatedGuestsFixture`; guest tap from `(7,5)` → `approach.kind=order`, `destination (1,4)`, `inFlight=order` sustained ≥12 samples → `ordered` + ticket (`08-order-enroute`, `09-order-complete`) |
| Far-tap **deliver** auto-complete | `prepareStationCarryFixture('valid_carry')`; guest tap while carrying → `approach.kind=deliver`, `inFlight=deliver` → guest `eating`, carry cleared (`11-deliver-enroute`, `12-delivered`) |
| Pending visibility en route | All four kinds above: `getPendingApproachIntentDebug()` non-null + matching `canvas.dataset.inFlight` while `isMoving`; clears on dispatch (`results.json` trails) |
| Sustained approach preview | Order walk: `destination (1,4)` unchanged across entire trail (`order.sustainedPreview: true`) |
| **Escape** / tap-elsewhere cancel | `floor-r3/results.json`: `escapeCleared: true`, `elsewhereCleared: true`; armed `order` revision cleared after Escape / empty-cell tap (`06`/`07` stills) |
| Distant intent hints (round 1) | Service start: `getInteractHintCells()` → `(3,3)`, `(4,3)` before any walk (`02-service-start`) |
| Guest head cues + mouth anchor (round 2) | Order bubble `visible:true`; `mouthInHeadBand`, `anchorNotAtFeet` on seated guest (`10-order-bubble`, `results.json` `bubble`) |
| Door-line queue staging (round 1) | `queuedGuests: 3` at service open (`03-door-line`) |
| Morning-gate copy (round 2) | *"Guest at the door — set every table first, then you can seat them."*; seat CTA disabled (`02-service-start`) |
| Mid-walk input buffer (round 2) | Fresh session: `(7,5)` → tap `(3,4)` mid-walk retap `(5,6)` → arrives `(5,6)` without dropped input |
| Canvas presence | Mobile mount **~81%** / desktop **~80%** viewport height (`results.json` `canvasFill`) |

**Partial / not re-verified live this run:**

| Claim | Finding |
|-------|---------|
| Far-tap **clear** | Main run: no `dirty` table after deliver-chain eating ticks; `clear`/`set`/`deliver` arrival gates covered in `floor-feel-round3.test.ts` |
| Far-tap **compose** | Long-session station tap returned `approach: null` (fixture/grid state polluted after deliver); compose path logic green in unit tests |
| Camera lead-ahead | `cameraLead.moving: null` — offset probe used wrong guest-debug camera; lead code unchanged (`cameraLeadOffset` 0.75 tile in `RestaurantApp.onTick`) |
| HUD `data-in-flight` shimmer | Still absent — `FloorServiceHud.ts` unchanged |

---

### Blind scorecard (re-scored)

| Category | OC2 | PlateUp | Dead Cells | Diner Dash | Val's | Verdict vs benchmarks | One-line evidence |
|----------|:---:|:-------:|:----------:|:----------:|:-----:|:---------------------:|-------------------|
| **Input responsiveness** | 5 | 4 | 5 | 4 | **4** | **Below** | Far-tap walk-and-complete + mid-walk buffer verified; **locked-rule ceiling:** 2 t/s still feels leisurely vs OC snap. |
| **Pathing quality** | 5 | 4 | 4 | 3 | **3** | **Below** | A* + buffer repath solid; 90° segments, guest blocking, constant tile timing unchanged. |
| **Camera feel** | 4 | 4 | 5 | 3 | **4** | **Below** | ~81%/80% canvas fill; lead-ahead in code; static scale vs Dead Cells parallax. |
| **Interaction affordances** | 5 | 5 | 4 | 4 | **4** | **Below** | Far/near hints + sustained approach preview + head bubbles; floor bar still text-only labels. |
| **Action feedback / anticipation** | 5 | 4 | 5 | 3 | **4** | **Below** | `data-in-flight` on all approach kinds en route; seat hold + doorway crop; deliver/serve punch still thin vs OC. |
| **State readability under load** | 5 | 5 | 4 | 4 | **4** | **Below** | Morning banner names door guest; 3 queued + disabled seat coexist; approach destination readable en route. |
| **Error / forgiveness handling** | 3 | 4 | 5 | 3 | **3** | **At** | Escape clears armed approach; wrong-table toast + delivery retry unchanged. |
| **Animation-transition smoothness** | 4 | 4 | 5 | 3 | **4** | **Below** | Smoothstep ends + linear mid-segments; stop-anticipation before auto-dispatch; corners still snap. |
| **Audio-visual feedback coupling** | 5 | 4 | 5 | 3 | **3** | **Below** | Deliver `serve` + review juice; seat/order/walk still quiet `uiClick`. |
| **Pacing legibility (no timers)** | 4 | 5 | 3 | 4 | **4** | **Below** | Order bubble + eating/leaving cues + banner; eating dots easy to miss at mobile zoom. |
| **Waiting-line behavior** | 3 | 5 | — | 5 | **4** | **Below** | Three `queued` guests at open (`03`); admit remains single-slot. |
| **Service flow clarity (seat→order→deliver)** | 5 | 5 | — | 4 | **4** | **Below** | One far tap → walk → auto seat/order/deliver/set verified; dual HUD/canvas + walk latency keep it below PlateUp one-glance service. |

**Roll-up:** Val's remains **at** error/forgiveness only. Round 3 closes the adjacency-friction gap (one-tap walk-and-complete) but **does not reach AAA parity** on locomotion pace, feedback punch, or floor chrome.

---

### Overall verdict

**Does the slice now meet or exceed the AAA benchmark in a blind side-by-side?** **No.** Against Overcooked! 2 / PlateUp! the floor reads as a **complete casual service loop** — far taps reliably path, preview, and finish seat/order/deliver/set without hunt-the-tile — but **locked-rule ceiling** 2 t/s grid walk and text-only floor HUD keep moment-to-moment play below benchmark snap and iconographic clarity. Standout win: **unified approach-and-complete with sustained preview + cancel**. Standout remaining drag: **walk pace (locked)** and **floor HUD presentation**.

---

### Remaining gaps (ranked by player impact)

| Rank | Gap | Where | Notes |
|:----:|-----|-------|-------|
| 1 | Floor action bar text-only — no icons or `data-in-flight` CTA shimmer | `FloorServiceHud.ts` | Concurrent agent scope |
| 2 | Locomotion still 2 t/s — feels sluggish vs OC | `NavController.ts` default | **Locked-rule ceiling** |
| 3 | Far actions still require full walk before dispatch | `approach-intent.ts` + PRD adjacency | **Locked-rule ceiling** (by design; not OC instant-range) |
| 4 | Seat/order SFX use generic `uiClick` — weak vs deliver `serve` | `service-events.sfxForFloorFeelBeat` | S |
| 5 | Single-slot admit — silhouettes promise throughput domain blocks | `domain/floor/entry.ts` | L |
| 6 | Clear/compose far-tap not exercised end-to-end in this Playwright pass | live closing run | Covered in `floor-feel-round3.test.ts` |
| 7 | Camera lead not re-measured live this run | `RestaurantApp.onTick` | Code unchanged from round 1 |

## Implemented (round 4)

Micro-polish closing round (final). Tasks that landed in this doc's fence:

| # | What | Where | Tests |
|---|------|-------|-------|
| **1** | Seat / order / deliver use distinct shipped Kenney SFX (`placement` / `purchase` / `serve`); walk stays `uiClick`. Punchier volumes on seat/order play sites. | `service-events.ts` `sfxForFloorFeelBeat`, `RestaurantApp.ts` playSfx path | `floor-feel-round4.test.ts`, updated `floor-feel-hints` SFX case |
| **2** | Remaining queued silhouettes **slide** to the next line slot on admit (smoothstep ~280ms) instead of popping. Presentation only — admit rules untouched. | `waiting-line.ts` (`queueLineAdvancePosition`), `ActorLayer.ts` queued sync | `floor-feel-round4.test.ts` |

Chrome tasks (#3 HUD dialog, #4 tutorial skip) are recorded in `chrome-onboarding.md` § Implemented (round 4).
