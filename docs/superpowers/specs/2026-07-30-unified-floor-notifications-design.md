# Unified floor notifications (banner stack)

**Status:** Draft v5 — responsive plan tightened; notification architecture unchanged  
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
- Horizontal inset `0.75rem` (or `0.45rem` to match tickets dock).
- **Three-line clamp (cross-engine):** banner body uses an explicit fallback stack so WebKit/Chromium/Firefox all hard-stop at three lines:

```css
.celebration-banner-body,
.notice-banner-body {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  line-height: 1.25;
  /* Fallback when line-clamp is ignored: additive cap by 3 line-heights */
  max-height: calc(1.25em + 1.25em + 1.25em);
  overflow-wrap: anywhere;
  word-break: break-word;
}
```

  Do not rely on `-webkit-line-clamp` alone.
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

### Token-derived sizing (v5 responsive plan)

**Problems addressed vs v3/v4:** fixed rem locks clip under zoom; typed CSS multiplication (`N * var(...)`) has uneven engine support; short landscape must not waste vertical space on a forced second row; 320px widths need a dedicated label layout; internal scroll needs a bounded container first.

#### 1. Buttons and labels

- Floor actions: `min-height: var(--vk-cta-h)`; `height: auto` so text zoom can grow the control; do **not** hard-code 48px.
- Labels: allow wrap up to two lines inside the button (`line-height` + `max-height` fallback similar to banner), with `hyphens` / `overflow-wrap: anywhere` as needed.
- **`max-width: 320px` layout (required):** dedicated rules so four verbs (+ Close Day) do not overflow labels:

```css
@media (max-width: 320px) {
  :root {
    --vk-floor-chrome-min-h: var(--vk-floor-chrome-min-h-2);
  }
  .floor-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .floor-actions .service-btn {
    font-size: 0.8125rem;
    padding-inline: 0.35rem;
    white-space: normal;
  }
}
```

  At 321px–760px portrait, keep a 2×2 / 3+ wrap grid as today but with wrapping labels, not a single cramped row of five.

#### 2. Additive `calc()` only (no typed multiplication)

Avoid `calc(var(--vk-floor-action-rows) * var(--vk-cta-h))` and similar. Publish **explicit** one-row and two-row min-heights with additive sums:

```css
:root {
  --vk-floor-chrome-pad-y: 0.75rem; /* top + bottom padding */
  --vk-floor-chrome-gap: 0.5rem;
  /* one row: cta + pad */
  --vk-floor-chrome-min-h-1: calc(var(--vk-cta-h) + var(--vk-floor-chrome-pad-y));
  /* two rows: cta + gap + cta + pad */
  --vk-floor-chrome-min-h-2: calc(
    var(--vk-cta-h) + var(--vk-floor-chrome-gap) + var(--vk-cta-h) + var(--vk-floor-chrome-pad-y)
  );
  --vk-floor-chrome-min-h: var(--vk-floor-chrome-min-h-1);
}
.chrome-mount:not([hidden]) {
  flex: 0 0 auto;
  min-height: var(--vk-floor-chrome-min-h);
}
```

#### 3. When to reserve two rows (not “short landscape ⇒ two”)

| Viewport | Action rows reserved | Rationale |
|----------|----------------------|-----------|
| Wide + tall (e.g. `min-width: 761px` and `min-height: 501px`) | **1** | Single row of controls |
| Narrow portrait (`max-width: 760px` and `min-height: 501px`) | **2** | Grid wraps; reserve height so Close Day does not jump |
| Short landscape (`max-height: 500px`) | **1** | Prefer one row — vertical space is scarce; allow horizontal scroll of the action track if needed rather than eating the canvas |
| `max-width: 320px` | **2** (2×2 grid) | Dedicated tiny-width layout |

```css
@media (max-width: 760px) and (min-height: 501px) {
  :root {
    --vk-floor-chrome-min-h: var(--vk-floor-chrome-min-h-2);
  }
  .floor-actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-height: 500px) {
  :root {
    --vk-floor-chrome-min-h: var(--vk-floor-chrome-min-h-1);
  }
  .floor-actions {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-flow: column;
    overflow-x: auto;
    overscroll-behavior-x: contain;
  }
}
```

Always reserve a Close Day grid cell (`visibility: hidden` when not closable) inside the chosen row plan so showing Close Day does not change `--vk-floor-chrome-min-h`.

#### 4. Extreme zoom — bounded scroll region first

Do **not** put `overflow-y: auto` on `#chrome-mount` itself (that fights flex sizing).

1. Structure: `#chrome-mount` > `.floor-service-panel` > `.floor-actions-scroll` > `.floor-actions`.
2. Bound the scrollport with additive `max-height` from tokens + viewport, e.g.:

```css
.floor-actions-scroll {
  max-height: min(
    var(--vk-floor-chrome-min-h-2),
    calc(100dvh - var(--vk-status-hud-height, 2.75rem) - 8rem)
  );
  overflow-x: auto;
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

3. Only when computed content height exceeds that bound (text zoom / 200% page zoom) does internal scrolling engage. Below the bound, no scrollbar.
4. Tests must prove the scrollport exists and that buttons remain reachable (scroll into view), not that the outer chrome equals one pixel height.

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

### E2E / visual — required matrix

| Engine | Viewport / condition | Intent |
|--------|----------------------|--------|
| Chromium | 390×844 | Tall phone portrait (2-row reserve) |
| Chromium | 320×568 | Tiny width — 2×2 label layout, no overflow |
| Chromium | 667×375 | Short landscape — **one** row (+ horizontal scroll if needed) |
| Chromium | 768×1024 | Tablet portrait |
| Chromium | 1280×800 | Desktop |
| Chromium | 390×844 @ **200% zoom** (or `deviceScaleFactor` + CSS zoom harness) | Token min-height + bounded scrollport; buttons reachable |
| WebKit | 390×844 | iOS-like |
| Firefox | 390×844 | Gecko sanity |

Assertions (relative):

- No tutorial/toast/arrival nodes in chrome.
- Four verbs present; Close Day reserved/hidden when not closable.
- Chrome `min-height` ≥ additive token formula for the active row plan (`min-h-1` or `min-h-2`).
- Short landscape uses one-row min-height; 320px uses 2-column grid without label overflow (`scrollWidth` of button ≤ client width + 1).
- Banner body computed style exposes three-line clamp **or** `max-height` fallback; long copy does not exceed ~3 lines.
- Under 200% zoom, overflow is confined to `.floor-actions-scroll` (bounded); outer flex layout does not unbounded-grow past the scrollport max-height.
- Canvas height unchanged across notice show/hide.
- Banner below HUD without double safe-area; pass-through taps; dismiss notice reveals celebration.

## Resolved decisions

| Topic | Decision |
|-------|----------|
| Banner offset | HUD height + 0.45rem only — **no** extra safe-area-top |
| CTA token | Use `--vk-cta-h` (52px in chibi `:root`); floor buttons must not hard-code 48px |
| Chrome height | Additive token `min-height` (`min-h-1` / `min-h-2`); no typed multiplication |
| Short landscape | **One** row preferred |
| 320px | Dedicated 2-column label-safe layout |
| Two-row reserve | Narrow **and** tall enough (`max-width: 760px` and `min-height: 501px`) |
| Line clamp | `-webkit-line-clamp` + `line-clamp` + additive `max-height` fallback |
| Extreme zoom | Bounded `.floor-actions-scroll` before internal scroll |
| Three-button cap | Removed |
| Tutorial dismiss | Per-step until step changes |
| Timer while hidden | Pause on unmount **and** `visibilitychange` / BFCache `pagehide` |
| Tests | Desktop, tablet, 320, short landscape, 200% zoom, Chromium/WebKit/Firefox |

## Implementation sketch (after v5 approval)

1. Notification timer + store fields; lifecycle helper (mount, visibility, pagehide/pageshow).
2. Banner: HUD-offset, stack, inert back, dwell-independent motion, three-line clamp fallback.
3. Floor chrome: additive `min-h-1`/`min-h-2`, short-landscape one-row, 320px 2-col, bounded `.floor-actions-scroll`, buttons `var(--vk-cta-h)`, remove messages/arrival/ticket strip; reserved Close Day cell.
4. Tests: unit lifecycle + required viewport/zoom matrix above.
