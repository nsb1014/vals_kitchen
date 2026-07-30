# Unified floor notifications (banner stack)

**Status:** Draft v4 — responsive sizing + visibility lifecycle; awaiting approval  
**Date:** 2026-07-30  
**Related:** `CelebrationBanner`, `floorToast`, `FloorServiceHud`, `--vk-status-hud-height`, `--vk-cta-h` (chibi theme: **52px**)

## Goal

All in-game status copy (toasts, tutorial steps, pacing hints) uses the **same top banner slot** as achievements/recipe celebrations. The bottom floor strip is an **actions-only bar** sized from design tokens (not a magic rem literal), so the restaurant canvas stops jumping when **messages** appear, without clipping controls under zoom/text scaling.

## Non-goals

- Redesigning celebration art, badge artwork, or unlock rules.
- Adding new canvas tap handlers for set / seat / take-orders / clear (those remain chrome buttons only).
- Changing ticket gameplay beyond removing the inline ticket chip strip from the floor chrome (Tickets dock remains the ticket UI).
- Folding modal review / day-summary into this stack (those stay overlays).

## UX

### Single visual slot

- One host, same card chrome as today’s celebration banner (`min-height: 4.5rem`, `width: min(100%, 34rem)`, centered).
- **Placement (no double safe-area):**  
  `top: calc(var(--vk-status-hud-height, 2.75rem) + 0.45rem)`  
  Match `.floor-tickets-dock`. Do **not** add `env(safe-area-inset-top)` here — `.game-shell` already applies top safe-area padding, and `--vk-status-hud-height` is measured inside that padded surface. Adding the inset again double-counts on iOS.
- Horizontal inset `0.75rem` (or `0.45rem` to match tickets dock); body copy **wraps up to 3 lines** then clamps (tutorial must remain readable).
- Transient floor copy uses a `notice` visual variant (same geometry; no badge / ingredient icon row).

### Stack (front covers back)

- At most **one front** card visible for interaction.
- When a notice is front and a celebration is waiting, the celebration stays in `celebrationQueue[0]` and may be painted underneath (same footprint) with `aria-hidden` + `inert`.
- Not a second row; not a bottom toast.

### Pointer / click interception

- Host `pointer-events: none` except **dismiss** (`pointer-events: auto`).
- Card body does not intercept canvas taps.
- Acceptance: canvas cells beside/under card margins remain tappable while a notice is showing.

### Dismiss and reveal

- × dismisses **only the front** card; covered celebration resumes from `remainingMs`.

#### Manual dismiss of persistent tutorial

1. Set `tutorialDismissedStepId` = current step (ephemeral; not persisted).
2. Clear sticky/active tutorial for that body.
3. Do not re-show until `nextTutorialStep` is a **different** step (or day ends).
4. Transient toast ending restores tutorial only if that step was not manually dismissed.

## Notice kinds and lifetime

| Source | `source` | Auto-dismiss | Notes |
|--------|----------|--------------|-------|
| Day-1 `tutorialPrompt` | `tutorial` | None — step change / done / manual dismiss | Sticky base |
| Pacing / arriving | `pacing` | 2500ms | Transient |
| `setFloorToast` / blocked nav | `toast` / `system` | 2500ms | Transient |
| Recipe / mastery / achievement | celebration | 4000ms while front | Pause when covered or surface hidden |

## Priority / replacement (v1 — no `noticeBack`)

1. Tutorial sticky while step active and not dismissed.
2. Transient covers sticky; on end, sticky returns unless dismissed.
3. New tutorial step replaces sticky and clears prior dismiss flag.
4. Tutorial done clears sticky + dismiss flag.
5. Transient replaces transient; duplicate same body **extends dwell** only.
6. Celebrations pause under any active notice.

## Timer controller (single owner)

Store-owned controller (`notification-timer.ts` or store module). Banner never owns dwell timeouts.

### Fields

```ts
type TimerFields = {
  durationMs: number;
  remainingMs: number;
  runningSinceMs: number | null; // performance.now(); null if paused
};

noticeActive: Notice | null;
noticeSticky: Notice | null;
tutorialDismissedStepId: TutorialStepId | null;
/** True only when the banner host is connected AND the page may show it */
notificationSurfaceActive: boolean;
celebrationQueue: Celebration[];
```

### Surface activity (mount is not enough)

Auto-dismiss may run only when **all** are true:

1. Banner host is mounted in the document (`isConnected`).
2. `document.visibilityState === 'visible'` (background tab / app switch → pause).
3. Not in a frozen BFCache page (listen to `pagehide` / `pageshow` with `persisted`; on `pagehide` pause; on `pageshow` re-sync).

Wire via a small lifecycle helper used by the banner mount:

- `mounted` / `unmounted`
- `document.visibilitychange`
- `pagehide` / `pageshow` (Safari BFCache)
- optional: `freeze` / `resume` if available

When surface becomes inactive: **pause** the logical front (same as cover) — subtract elapsed, clear `runningSinceMs`, cancel timeout.  
When surface becomes active again: `syncNotificationTimer()` resume from `remainingMs`.  
**Never** leave a wall-clock timeout running that can fire while the player cannot see the banner.

| Event | Timer behavior |
|-------|----------------|
| Enqueue celebration | Append; start only if uncovered + surface active |
| Notice covers celebration | Pause head |
| Transient / duplicate / tutorial dismiss | As in v3 |
| Day teardown / hydrate / soft reset | Clear notices + timers |
| Surface inactive (unmount, hidden tab, pagehide) | Pause front; cancel timeout |
| Surface active again (remount, visible, pageshow) | Resume from `remainingMs` |

## CSS animation vs dwell

- Short entrance/exit; dwell owned by timer; `prefers-reduced-motion` → instant show.
- Covered/back card: paused animation + full opacity (or hidden); never end-of-4s-fade invisible.
- Do not use a single 4s keyframe as dismiss duration.

## Bottom chrome (actions only)

### Reachability (no three-button cap)

Canvas taps handle **cook + deliver** only. Always offer Set / Seat / Take orders / Clear (enabled via selectors). **Close Day** only when `selectCanCloseDay`.

### Token-derived sizing (no magic 4.75 / 8.25 rem locks)

**Problem with v3 literals:** fixed `4.75rem` / `8.25rem` assumes 48px buttons and clips under text zoom; chibi theme sets `--vk-cta-h: 52px` while some `.service-btn` rules still hard-code `48px`.

**v4 rules:**

1. Floor action buttons use `min-height: var(--vk-cta-h)` (and prefer `height: auto; min-height: var(--vk-cta-h)` so large text can grow the control).
2. Chrome strip uses **`min-height`** derived from tokens, not a fixed `height`/`max-height` that clips:

```css
:root {
  --vk-floor-chrome-pad-y: 0.75rem; /* top+bottom padding sum */
  --vk-floor-chrome-gap: 0.5rem;
  --vk-floor-action-rows: 1;
  --vk-floor-chrome-min-h: calc(
    (var(--vk-floor-action-rows) * var(--vk-cta-h))
    + ((var(--vk-floor-action-rows) - 1) * var(--vk-floor-chrome-gap))
    + var(--vk-floor-chrome-pad-y)
  );
}
.chrome-mount:not([hidden]) {
  flex: 0 0 auto;
  min-height: var(--vk-floor-chrome-min-h);
  /* Allow growth under text zoom; do not max-height clip CTAs */
}
.floor-actions {
  gap: var(--vk-floor-chrome-gap);
}
.floor-actions .service-btn {
  min-height: var(--vk-cta-h);
}
```

3. **Row count** is not width-only. Set `--vk-floor-action-rows: 2` when the action grid would wrap **or** when the viewport is short — e.g.:

```css
/* Narrow OR short landscape / small portrait — reserve two CTA rows so Close Day
   does not jump the canvas when it appears */
@media (max-width: 760px), (max-height: 500px) {
  :root {
    --vk-floor-action-rows: 2;
  }
}
```

   Prefer aligning wrap with the same media (or a container query on `.floor-actions` / `.game-surface`) so reserved rows match layout. Implementation may use `@container` on `.game-surface` if cleaner than dual media.

4. **Stability vs messages:** removing tutorial/toast/ticket rows is what stops message-driven jumps. Close Day visibility should not change reserved `--vk-floor-action-rows` on mobile/short (always reserve 2 rows there). On wide+tall (`rows: 1`), Close Day may slightly change intrinsic height; acceptable if rare, or always reserve a Close Day slot with `visibility: hidden` / empty grid cell when not closable (preferred for zero jump).

5. Extreme zoom: if content exceeds viewport, chrome may scroll internally (`overflow-y: auto`) rather than clip buttons; canvas flexes. Do not assert a single pixel height in tests.

### What is removed from chrome

- Tutorial / pacing / toast rows.
- Inline ticket strip / “No tickets”.
- Initial-arrival special panel — arrival is a notice; chrome layout always the actions grid.

## Accessibility

- Front: `aria-live="polite"`; dismiss label “Dismiss notice” / “Dismiss celebration”.
- Back: `aria-hidden` + `inert`.

## Testing

### Unit

- Timer pause/resume, duplicate extend, tutorial dismiss-per-step, surface inactive (hidden/pagehide) pauses, pageshow/visible resumes, teardown clears.
- Priority: toast over tutorial; celebration under notice.
- Animation decoupled from dwell; reduced-motion.

### E2E / visual — viewport matrix (not a single 390×844 assert)

Run (or document as required matrix) at least:

| Engine | Viewport | Intent |
|--------|----------|--------|
| Chromium | 390×844 | Tall phone portrait |
| Chromium | 667×375 | Short landscape phone |
| Chromium | 360×640 | Small portrait |
| WebKit | 390×844 | iOS-like |
| Firefox | 390×844 | Gecko sanity |

Assertions (relative, not `height === 8.25rem`):

- No `floor-tutorial` / `floor-toast` / `floor-arrival-panel` in chrome.
- Four verbs present; Close Day only when closable (or reserved hidden slot).
- Chrome `min-height` ≥ token formula using computed `--vk-cta-h` and `--vk-floor-action-rows`.
- Each visible action button’s box is fully inside the chrome strip (no clipping).
- Canvas height unchanged across notice show/hide (message stability).
- Banner `top` matches HUD-offset formula **without** extra safe-area; below status HUD.
- Pass-through tap near banner; long tutorial wraps; dismiss notice reveals celebration.

Optional: one run with `forced-colors` / larger default font if harness allows.

## Resolved decisions

| Topic | Decision |
|-------|----------|
| Banner offset | HUD height + 0.45rem only — **no** extra safe-area-top |
| CTA token | Use `--vk-cta-h` (52px in chibi `:root`); floor buttons must not hard-code 48px |
| Chrome height | Token-derived **min-height**; grow under zoom; no fixed 4.75/8.25 clip lock |
| Breakpoint | Width **or** short height → reserve 2 action rows |
| Three-button cap | Removed |
| Tutorial dismiss | Per-step until step changes |
| Timer while hidden | Pause on unmount **and** `visibilitychange` / BFCache `pagehide` |
| Tests | Multi-engine + multi-viewport matrix; relative asserts |

## Implementation sketch (after v4 approval)

1. Notification timer + store fields; lifecycle helper (mount, visibility, pagehide/pageshow).
2. Banner: HUD-offset (no double inset), stack, inert back, dwell-independent motion.
3. Floor chrome: token `min-height`, `--vk-floor-action-rows` via width/height media (or container), buttons `var(--vk-cta-h)`, remove messages/arrival/ticket strip; optional reserved Close Day cell.
4. Tests: unit lifecycle + e2e matrix above.
