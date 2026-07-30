# Unified floor notifications (banner stack)

**Status:** Draft v2 — addresses PR #28 review; awaiting re-approval  
**Date:** 2026-07-30  
**Related:** `CelebrationBanner`, `floorToast`, `FloorServiceHud`, `--vk-status-hud-height` (published by `ServiceDayUi`)

## Goal

All in-game status copy (toasts, tutorial steps, pacing hints) uses the **same top banner slot** as achievements/recipe celebrations. The bottom floor strip is a **fixed-height, context-sensitive action bar** (no status text), so the restaurant canvas stops jumping when messages appear.

## Non-goals

- Redesigning celebration art, badge artwork, or unlock rules.
- Changing ticket gameplay beyond removing the inline ticket chip strip from the floor chrome (Tickets dock remains the ticket UI).
- Folding modal review / day-summary into this stack (those stay overlays).

## UX

### Single visual slot

- One host, same card chrome as today’s celebration banner (`min-height: 4.5rem`, `width: min(100%, 34rem)`, centered).
- **Placement (mobile contract):** host top offset is  
  `calc(var(--vk-status-hud-height, 2.75rem) + env(safe-area-inset-top, 0px) + 0.45rem)`  
  so the card sits **below** the measured status HUD (same pattern as `.floor-tickets-dock`), not at a hard-coded `0.75rem` that can overlap Cash/Rating.
- At narrow widths the card may use full content width minus horizontal inset (`0.75rem`); body copy **wraps up to 3 lines** then clamps with ellipsis (tutorial text must remain readable — no single-line ellipsis-only body).
- Transient floor copy uses a `notice` visual variant (same geometry; no badge / ingredient icon row).

### Stack (front covers back)

- At most **one front** card visible for interaction.
- When a notice is front and a celebration is waiting, the celebration stays in `celebrationQueue[0]` and may be painted underneath (same footprint) with `aria-hidden` + `inert` so it cannot receive focus or be announced as the active message.
- Not a second row; not a bottom toast.

```
[ Status HUD  — height → --vk-status-hud-height ]
[ Banner: FRONT (notice or celebration)          ]
[         BACK celebration inert/paused if any   ]
[ Canvas …                                       ]
[ Fixed action bar (context-sensitive buttons)   ]
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

## Notice kinds and lifetime

| Source | `source` | Auto-dismiss | Cover / replace behavior |
|--------|----------|--------------|---------------------------|
| Day-1 `tutorialPrompt` | `tutorial` | **None** — persistent until step changes or completes (`done`) | Standing base notice; see priority below |
| “First guest arriving…” / pacing | `pacing` | ~2.5s | Transient |
| `setFloorToast` / blocked nav / wrong table | `toast` / `system` | ~2.5s | Transient |
| Recipe / mastery / achievement | celebration kinds | 4s while front | Never dropped when covered — only paused |

**Tutorial must not use the short toast timer.** A Day-1 instruction stays until the tutorial step advances or clears.

## Priority / replacement (v1 — no `noticeBack`)

v1 does **not** use `noticeBack`. Celebrations are the only “underneath” layer.

Precedence for the **notice** layer (`noticeActive`):

1. **`tutorial`** is the sticky base while a tutorial step is active.
2. A **transient** notice (`toast` | `pacing` | `system`) **covers** the tutorial temporarily: tutorial is retained in `noticeSticky` (not destroyed); transient becomes `noticeActive`.
3. When the transient ends (timer or dismiss), **`noticeSticky` tutorial returns** to `noticeActive` if the step is still current.
4. A new tutorial step **replaces** sticky + active tutorial bodies.
5. Tutorial `done` / null prompt **clears** sticky tutorial.
6. Transient **replaces** transient (see duplicates).
7. Celebrations are independent: if `noticeActive` is set, celebration head is covered+paused; if not, celebration is front as today.

### Duplicate transient behavior

- Same `source` + same `body` while that transient is already `noticeActive`: **refresh remaining time** to full duration (do not re-announce / do not restart entrance animation from scratch if already visible — extend dwell only).
- Different body: replace active transient; reset duration and play entrance once.

## Timer controller (single owner)

Replace the current module-level “restart full 4s on head change” behavior with an explicit **notification timer controller** owned by the store module (or a small `notification-timer.ts` used only by the store). One monotonic owner; the banner never owns dwell timeouts.

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
  /** tutorial: durationMs = Infinity / no auto schedule */
  timer: TimerFields;
};

// Celebrations gain the same timer fields (or parallel map keyed by identity)
```

Ephemeral store UI (not persisted — strip on snapshot like today):

```ts
noticeActive: Notice | null;   // current notice layer (front if set)
noticeSticky: Notice | null;   // persistent tutorial retained under transients
celebrationQueue: Celebration[]; // each entry carries timer fields once dequeued to head
```

Remove draft `noticeBack` from v1.

### State transitions

| Event | Timer behavior |
|-------|----------------|
| Enqueue celebration | Append; if becomes uncovered front, start `remainingMs = durationMs`, `runningSinceMs = now` |
| Notice covers celebration | Pause celebration head: `remainingMs -= now - runningSinceMs`, `runningSinceMs = null`; clear timeout |
| Transient covers sticky tutorial | Pause sticky (no-op if tutorial has no auto timer); start transient timer |
| Transient ends / dismissed | Clear active transient; restore sticky tutorial to active if still valid; **resume** celebration head if no notice remains |
| Reveal celebration | `runningSinceMs = now`; schedule timeout for `remainingMs` |
| Manual dismiss front celebration | Clear timeout; dequeue; start next head fresh (`remainingMs = durationMs`) |
| Queue-head change while uncovered | Cancel prior timeout; start new head fresh |
| Replace transient | Cancel prior transient timeout; start new full duration |
| Duplicate transient (same body) | Set `remainingMs = durationMs`; if running, reschedule from now (no entrance replay) |
| Day teardown / CLOSE_DAY / hydrate import / soft reset | Clear notices, clear celebration timers, cancel timeout |
| Banner component unmount | Cancel scheduled timeout only; do not clear queue (store remains source of truth); on remount, re-sync from store (`syncNotificationTimer`) |

Default durations: toast/pacing/system **2500ms**; celebrations **4000ms**; tutorial **no auto-dismiss**.

## CSS animation vs dwell

Do **not** bind dwell to the existing 4s `celebration-banner-cycle` fade.

- **Entrance:** short (~200–300ms) fade/slide; respects `prefers-reduced-motion: reduce` (instant show).
- **Dwell:** driven only by the timer controller (variable length).
- **Exit:** short fade on dismiss / timer fire; optional.
- When a card is covered (back / inert): set `animation-play-state: paused` **and** freeze opacity at fully visible (or hide back visually and only show front). Covered celebrations must not sit at end-of-cycle opacity 0.
- Preferred implementation: split entrance keyframes from dwell; do not run a single 4s animation that equals dismiss time.

## Bottom chrome (actions only + context-sensitive)

### Layout mechanism (matches current `main`)

On current `main`, `.chrome-mount` is `flex: 0 0 auto` in the column under `#canvas-mount` (no `--vk-floor-chrome-h` yet). This work **introduces**:

```css
:root {
  --vk-floor-chrome-h: …; /* fixed; see below */
}
.chrome-mount:not([hidden]) {
  flex: 0 0 var(--vk-floor-chrome-h);
  height: var(--vk-floor-chrome-h);
  max-height: var(--vk-floor-chrome-h);
  overflow: hidden;
}
```

so message removal and action count changes cannot resize the canvas.

### What is removed from chrome

- Tutorial / pacing / toast rows.
- Inline ticket chip strip and “No tickets” empty copy (Tickets dock only).
- Special **initial-arrival** panel branch (`floor-arrival-panel` with message + ticket row) — deleted; arrival copy is a `pacing`/`tutorial` notice; chrome always uses the same actions layout.

### Context-sensitive actions (required)

Do **not** always render all five controls. Show only actions that are currently meaningful; keep the **strip height fixed** so the grid does not reflow the canvas.

**Policy (v1):**

| Button | Shown when |
|--------|------------|
| Set table | `selectCanSetFloorTable` **or** any unset table exists (enabled only when adjacent/can set) |
| Seat guest | Any guest in `waiting` (enabled when seatable) |
| Take orders | Any seated guest who can be ordered / `selectCanTakeFloorOrders` path is relevant |
| Clear table | Any dirty table exists / clear is relevant |
| Close Day | `selectCanCloseDay` **only** (hide when not closable — do not show a disabled Close Day filling the grid) |

At most **three** primary controls visible at once on narrow viewports when possible (prefer the enabled / next-step actions). If more than three qualify, keep a stable priority order: Seat → Take orders → Set table → Clear → Close Day, and show the top three that qualify; overflow actions remain reachable via the same interactions on the floor (adjacency taps) where those already exist.

Empty slots in the fixed bar stay empty (no disabled ghost buttons crowding the strip).

**Mobile acceptance:** e2e screenshot at 390×844 during mid-service proving the action strip is a single compact row (or sparse fixed bar), materially less than today’s full 3+2 disabled grid, and canvas height unchanged when notices fire.

## Accessibility

- Front card: `aria-live="polite"` (host); dismiss control `aria-label` matches kind (“Dismiss notice” vs “Dismiss celebration”).
- Visual back card: `aria-hidden="true"` and `inert`.
- Focus: dismiss is reachable; card body is not a focus trap.

## Testing

- Unit — timer: cover/pause, reveal/resume remainder, duplicate toast extends dwell, tutorial never auto-clears, day teardown cancels timers, hydrate/import clears ephemeral notices.
- Unit — priority: toast covers tutorial then tutorial returns; celebration paused under notice; dismiss notice reveals same celebration identity.
- Unit — animation contract: reduced-motion path; dwell not coupled to 4s keyframe length.
- E2E — no `floor-tutorial` / `floor-toast` / `floor-arrival-panel` in chrome; actions-only strip; canvas height stable across notice changes; banner below HUD; canvas tap near banner still works; long tutorial wraps at mobile width; dismiss notice then see celebration.

## Resolved decisions

| Topic | Decision |
|-------|----------|
| Same size/location as achievements | Yes; offset below measured HUD |
| Toast over achievement | Yes; dismiss reveals |
| Timer while covered | Paused with `remainingMs` |
| Tutorial lifetime | Persistent until step change/done |
| Transient vs tutorial | Transient covers sticky tutorial, then returns |
| `noticeBack` | Removed from v1 |
| CSS vs dwell | Decouple; pause or freeze when covered |
| Bottom strip | Fixed height; context-sensitive actions; no arrival branch |
| Chrome variable | Introduce `--vk-floor-chrome-h` on top of current flex `chrome-mount` |
| Pointer events | Dismiss only |

## Implementation sketch (after v2 approval)

1. `notification-timer` controller + store fields (`noticeActive`, `noticeSticky`, celebration timer fields); route `setFloorToast` and tutorial/pacing publishers.
2. Banner host: HUD-offset placement, stack render, inert back, dwell-independent animation, dismiss labels.
3. `FloorServiceHud`: delete arrival branch; actions-only context-sensitive bar; fixed `--vk-floor-chrome-h`.
4. Tests + mobile screenshot acceptance as above.
