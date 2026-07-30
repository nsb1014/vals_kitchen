# Unified floor notifications (banner stack)

**Status:** Draft v3 — review clarifications folded; ready for implementation after ack  
**Date:** 2026-07-30  
**Related:** `CelebrationBanner`, `floorToast`, `FloorServiceHud`, `--vk-status-hud-height` (published by `ServiceDayUi`)

## Goal

All in-game status copy (toasts, tutorial steps, pacing hints) uses the **same top banner slot** as achievements/recipe celebrations. The bottom floor strip is a **fixed-height action bar** (no status text), so the restaurant canvas stops jumping when messages appear.

## Non-goals

- Redesigning celebration art, badge artwork, or unlock rules.
- Adding new canvas tap handlers for set / seat / take-orders / clear (those remain chrome buttons only).
- Changing ticket gameplay beyond removing the inline ticket chip strip from the floor chrome (Tickets dock remains the ticket UI).
- Folding modal review / day-summary into this stack (those stay overlays).

## UX

### Single visual slot

- One host, same card chrome as today’s celebration banner (`min-height: 4.5rem`, `width: min(100%, 34rem)`, centered).
- **Placement (mobile contract):** host top offset is  
  `calc(var(--vk-status-hud-height, 2.75rem) + env(safe-area-inset-top, 0px) + 0.45rem)`  
  so the card sits **below** the measured status HUD (same pattern as `.floor-tickets-dock`), not at a hard-coded `0.75rem` that can overlap Cash/Rating.
- At narrow widths the card may use full content width minus horizontal inset (`0.75rem`); body copy **wraps up to 3 lines** then clamps with ellipsis (tutorial text must remain readable — no single-line ellipsis-only body).
- Transient floor copy uses a `notice` visual variant (same geometry; no badge / ingredient icon row required).

### Stack (front covers back)

- At most **one front** card visible for interaction.
- When a notice is front and a celebration is waiting, the celebration stays in `celebrationQueue[0]` and may be painted underneath (same footprint) with `aria-hidden` + `inert` so it cannot receive focus or be announced as the active message.
- Not a second row; not a bottom toast.

```
[ Status HUD  — height → --vk-status-hud-height ]
[ Banner: FRONT (notice or celebration)          ]
[         BACK celebration inert/paused if any   ]
[ Canvas …                                       ]
[ Fixed action bar (chrome buttons)              ]
```

### Pointer / click interception

- Host remains `pointer-events: none` except on interactive controls.
- **Only the dismiss control** (and any future explicit action on the card) uses `pointer-events: auto`.
- The rest of the card is visual only — taps pass through to the canvas / HUD beneath and beside the banner.
- Acceptance: e2e (or unit+hit-test) that a canvas cell adjacent to / under the translucent card margins remains tappable while a notice is showing.

### Dismiss and reveal

- × dismisses **only the front** card.
- If the front was a notice covering a celebration, the celebration becomes the visible front and its timer **resumes from remaining ms**.
- If the front was a celebration, existing queue advance applies.

#### Manual dismiss of persistent tutorial

Tutorial notices have no auto-dismiss; manual dismiss is allowed and defined as:

1. Record `tutorialDismissedStepId` = current tutorial step id (ephemeral UI; not persisted).
2. Clear `noticeActive` / `noticeSticky` for that tutorial body so the banner can show celebrations or stay empty.
3. **Do not** re-show that step’s prompt until `nextTutorialStep` changes to a **different** step (or the day ends).
4. When the step advances, clear `tutorialDismissedStepId` if it no longer matches, and publish the new tutorial notice as usual.
5. If a transient toast was covering the tutorial and the player dismisses the toast, tutorial returns **only if** that step was not manually dismissed.

So: dismiss means “I got it for this step,” not “hide forever for the day.”

## Notice kinds and lifetime

| Source | `source` | Auto-dismiss | Cover / replace behavior |
|--------|----------|--------------|---------------------------|
| Day-1 `tutorialPrompt` | `tutorial` | **None** — persistent until step changes, completes (`done`), or **manual dismiss for that step** | Standing base notice; see priority below |
| “First guest arriving…” / pacing | `pacing` | 2500ms | Transient |
| `setFloorToast` / blocked nav / wrong table | `toast` / `system` | 2500ms | Transient |
| Recipe / mastery / achievement | celebration kinds | 4000ms while front | Never dropped when covered — only paused |

**Tutorial must not use the short toast timer.**

## Priority / replacement (v1 — no `noticeBack`)

v1 does **not** use `noticeBack`. Celebrations are the only “underneath” layer.

Precedence for the **notice** layer (`noticeActive`):

1. **`tutorial`** is the sticky base while a tutorial step is active **and** not manually dismissed for that step.
2. A **transient** notice (`toast` | `pacing` | `system`) **covers** the tutorial temporarily: tutorial is retained in `noticeSticky` (not destroyed); transient becomes `noticeActive`.
3. When the transient ends (timer or dismiss), **`noticeSticky` tutorial returns** to `noticeActive` if the step is still current and not manually dismissed.
4. A new tutorial step **replaces** sticky + active tutorial bodies and clears dismiss-for-previous-step.
5. Tutorial `done` / null prompt **clears** sticky tutorial and dismiss flag.
6. Transient **replaces** transient (see duplicates).
7. Celebrations are independent: if `noticeActive` is set, celebration head is covered+paused; if not, celebration is front as today.

### Duplicate transient behavior

- Same `source` + same `body` while that transient is already `noticeActive`: **refresh remaining time** to full duration (do not re-announce / do not restart entrance animation from scratch if already visible — extend dwell only).
- Different body: replace active transient; reset duration and play entrance once.

## Timer controller (single owner)

Replace the current module-level “restart full 4s on head change” behavior with an explicit **notification timer controller** owned by the store module (or a small `notification-timer.ts` used only by the store). One monotonic owner; the banner **never** owns dwell timeouts and **must not** keep a wall-clock timeout alive while nothing is on screen.

### Per-item timer fields

```ts
type TimerFields = {
  durationMs: number;   // full dwell when newly front
  remainingMs: number;  // ms left when paused or mid-dwell
  /** performance.now() when the current running interval started; null if paused/idle */
  runningSinceMs: number | null;
};

type Notice = {
  id: string;
  title?: string;
  body: string;
  source: 'toast' | 'tutorial' | 'pacing' | 'system';
  /** tutorial: no auto schedule */
  timer: TimerFields;
};
```

Ephemeral store UI (not persisted — strip on snapshot like today):

```ts
noticeActive: Notice | null;
noticeSticky: Notice | null; // persistent tutorial under transients
tutorialDismissedStepId: TutorialStepId | null;
notificationSurfaceMounted: boolean; // banner host connected
celebrationQueue: Celebration[]; // head carries timer fields while active
```

### Surface visibility (mount / unmount)

The banner host reports mount state into the store (`setNotificationSurfaceMounted`).

| Surface | Timer rule |
|---------|------------|
| **Mounted** | Front auto-dismiss items run normally |
| **Unmounted** (host removed, or restaurant UI torn down mid-queue) | Treat as **cover/pause** for whoever would be front: subtract elapsed, clear `runningSinceMs`, **cancel** the scheduled timeout. Do **not** keep a wall-clock timeout alive that can fire while nothing is on screen |
| **Remount** | `syncNotificationTimer()`: if a front item still has `remainingMs > 0` (or tutorial with no timer), resume; celebrations/notices do not silently expire off-screen |

This matches “store owns the timer” without “timeout fires in the dark.” Pausing on unmount is the same primitive as pausing under a covering notice.

### State transitions

| Event | Timer behavior |
|-------|----------------|
| Enqueue celebration | Append; if becomes uncovered front **and surface mounted**, start `remainingMs = durationMs`, `runningSinceMs = now` |
| Notice covers celebration | Pause celebration head; clear timeout |
| Transient covers sticky tutorial | Start transient timer (if mounted) |
| Transient ends / dismissed | Restore sticky tutorial if valid + not dismissed; resume celebration if no notice remains |
| Reveal celebration | Resume from `remainingMs` |
| Manual dismiss front celebration | Dequeue; start next head fresh if mounted |
| Manual dismiss tutorial | Set `tutorialDismissedStepId`; clear sticky/active tutorial; resume celebration if any |
| Queue-head change while uncovered | Start new head fresh if mounted; else arm paused at full `durationMs` |
| Replace / duplicate transient | As above |
| Day teardown / hydrate import / soft reset | Clear notices, dismiss flag, celebration timers, cancel timeout; `notificationSurfaceMounted` left to UI |
| Banner unmount | **Pause** front (do not clear queue); cancel timeout |
| Banner remount | Resume / re-schedule from `remainingMs` |

Default durations: toast/pacing/system **2500ms**; celebrations **4000ms**; tutorial **no auto-dismiss**.

## CSS animation vs dwell

Do **not** bind dwell to the existing 4s `celebration-banner-cycle` fade.

- **Entrance:** short (~200–300ms) fade/slide; respects `prefers-reduced-motion: reduce` (instant show).
- **Dwell:** driven only by the timer controller (variable length).
- **Exit:** short fade on dismiss / timer fire; optional.
- When a card is covered (back / inert): set `animation-play-state: paused` **and** freeze opacity at fully visible (or hide back visually and only show front). Covered celebrations must not sit at end-of-cycle opacity 0.
- Preferred implementation: split entrance keyframes from dwell; do not run a single 4s animation that equals dismiss time.

## Bottom chrome (actions only)

### Why no three-button cap

Canvas taps today handle **cooking and delivery** only. **Set table, seat guest, take orders, and clear table** are chrome-dispatched actions with **no** floor-tap equivalent. Hiding any of those behind a “top three” priority makes them unreachable. v3 **drops the three-button limit**.

### Context-sensitive policy (reachability-safe)

Always offer the four floor verbs as chrome controls (enabled when the matching selector says so; disabled when not — player can still see them):

| Button | Visibility | Enabled when |
|--------|------------|--------------|
| Set table | Always during floor service | `selectCanSetFloorTable` |
| Seat guest | Always during floor service | waiting guest + seat path available |
| Take orders | Always during floor service | `selectCanTakeFloorOrders` |
| Clear table | Always during floor service | `selectCanClearFloorTable` |
| Close Day | **Only when** `selectCanCloseDay` | same |

Clutter reduction vs today: remove message rows + ticket strip + arrival panel; hide Close Day until the day can close; do **not** omit set/seat/order/clear.

### Concrete fixed height

Introduce `--vk-floor-chrome-h` against current flex `.chrome-mount` on `main`:

```css
:root {
  /* 1 row: 48px CTA + 0.35+0.4rem padding + border ≈ 4.75rem */
  --vk-floor-chrome-h: 4.75rem;
}
@media (max-width: 760px) {
  /* 2×48px rows + 0.5rem gap + padding ≈ 8.25rem — fits 4 verbs, or 5 when Close Day shows */
  --vk-floor-chrome-h: 8.25rem;
}
.chrome-mount:not([hidden]) {
  flex: 0 0 var(--vk-floor-chrome-h);
  height: var(--vk-floor-chrome-h);
  max-height: var(--vk-floor-chrome-h);
  overflow: hidden;
}
```

Action buttons use `min-height: var(--vk-cta-h)` (48px). Mobile grid: `repeat(3, 1fr)` may wrap to two rows; the **strip height stays 8.25rem** whether Close Day is present or not (empty cell / spacer — canvas does not jump).

**Mobile acceptance:** e2e screenshot at 390×844 mid-service: chrome height equals `8.25rem` (±1px), only action buttons inside, canvas height unchanged when notices fire.

### What is removed from chrome

- Tutorial / pacing / toast rows.
- Inline ticket chip strip and “No tickets” empty copy (Tickets dock only).
- Special **initial-arrival** panel branch — deleted; arrival copy is a notice; chrome always uses the same actions layout.

## Accessibility

- Front card: `aria-live="polite"` (host); dismiss control `aria-label` matches kind (“Dismiss notice” vs “Dismiss celebration”).
- Visual back card: `aria-hidden="true"` and `inert`.
- Focus: dismiss is reachable; card body is not a focus trap.

## Testing

- Unit — timer: cover/pause, reveal/resume remainder, duplicate toast extends dwell, tutorial never auto-clears, **manual tutorial dismiss suppresses until step change**, unmount pauses / remount resumes without off-screen expiry, day teardown cancels timers.
- Unit — priority: toast covers tutorial then tutorial returns (unless dismissed); celebration paused under notice.
- Unit — animation: reduced-motion; dwell ≠ 4s keyframe.
- E2E — no tutorial/toast/arrival nodes in chrome; all four verbs present; Close Day only when closable; chrome height 8.25rem on mobile; canvas stable; banner below HUD; pass-through taps; long tutorial wraps; dismiss notice reveals celebration.

## Resolved decisions

| Topic | Decision |
|-------|----------|
| Same size/location as achievements | Yes; offset below measured HUD |
| Toast over achievement | Yes; dismiss reveals |
| Timer while covered / unmounted | Paused with `remainingMs` — never expires off-screen |
| Tutorial lifetime | Persistent until step change/done **or manual dismiss for that step** |
| Transient vs tutorial | Transient covers sticky tutorial, then returns unless dismissed |
| Three-button cap | **Removed** — set/seat/order/clear always offered |
| Mobile chrome height | **8.25rem**; desktop **4.75rem** |
| `noticeBack` | Removed from v1 |
| CSS vs dwell | Decouple; pause/freeze when covered |
| Chrome variable | Introduce `--vk-floor-chrome-h` on flex `chrome-mount` |
| Pointer events | Dismiss only |

## Implementation sketch (after v3 ack)

1. `notification-timer` + store (`noticeActive`, `noticeSticky`, `tutorialDismissedStepId`, `notificationSurfaceMounted`); route toasts + tutorial/pacing.
2. Banner host: HUD offset, stack, inert back, dwell-independent animation, mount→pause/resume wiring, dismiss labels.
3. `FloorServiceHud`: delete arrival branch; four verbs + conditional Close Day; fixed `--vk-floor-chrome-h` (4.75 / 8.25rem).
4. Tests + mobile height screenshot as above.
