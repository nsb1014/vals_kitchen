# Unified floor notifications (banner stack)

**Status:** Implemented (Chromium CI; Firefox opt-in; WebKit/iOS unverified)  
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

### Token-derived sizing (v7 responsive plan)

**Problems addressed vs v5/v6:** 320px with five reserved controls needs **three** rows (not two); short-height must not override the 320px layout on 320×480; 200% zoom tests must not use `deviceScaleFactor`; scroll `max-height` must not collapse below **one CTA row** (a `0px` floor left every action unreachable).

#### 1. Buttons and labels

- Floor actions: `min-height: var(--vk-cta-h)`; `height: auto` so text zoom can grow the control; do **not** hard-code 48px.
- Labels: allow wrap up to two lines inside the button (`line-height` + additive `max-height` fallback), with `overflow-wrap: anywhere` as needed.
- **`max-width: 320px` layout (required):** two columns × **three** rows for five reserved controls (Set, Seat, Take orders, Clear, Close Day slot):

```css
@media (max-width: 320px) {
  :root {
    --vk-floor-chrome-min-h: var(--vk-floor-chrome-min-h-3);
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

  At 321px–760px and tall enough, keep the 3-column wrap (two-row reserve). Source order in the stylesheet: **320px block after the short-height block**, and/or short-height excludes ≤320px (see §3).

#### 2. Additive `calc()` only (no typed multiplication)

```css
:root {
  --vk-floor-chrome-pad-y: 0.75rem; /* top + bottom padding */
  --vk-floor-chrome-gap: 0.5rem;
  --vk-floor-chrome-min-h-1: calc(var(--vk-cta-h) + var(--vk-floor-chrome-pad-y));
  --vk-floor-chrome-min-h-2: calc(
    var(--vk-cta-h) + var(--vk-floor-chrome-gap) + var(--vk-cta-h) + var(--vk-floor-chrome-pad-y)
  );
  /* three rows: cta + gap + cta + gap + cta + pad — required for 2×3 at 320px */
  --vk-floor-chrome-min-h-3: calc(
    var(--vk-cta-h) + var(--vk-floor-chrome-gap) + var(--vk-cta-h) + var(--vk-floor-chrome-gap)
      + var(--vk-cta-h) + var(--vk-floor-chrome-pad-y)
  );
  --vk-floor-chrome-min-h: var(--vk-floor-chrome-min-h-1);
}
.chrome-mount:not([hidden]) {
  flex: 0 0 auto;
  min-height: var(--vk-floor-chrome-min-h);
}
```

#### 3. Row reservation (320px wins over short-height)

| Viewport | Rows | Layout |
|----------|------|--------|
| Wide + tall (`min-width: 761px`) | **1** | Single row |
| Narrow + tall (`max-width: 760px` and `min-width: 321px` and `min-height: 501px`) | **2** | 3-column wrap |
| Short height **and** wider than 320px (`max-height: 500px` and `min-width: 321px`) | **1** | One row; horizontal scroll if needed |
| `max-width: 320px` (any height, including 320×480) | **3** | 2-column × 3-row; **must not** be overridden by short-height |

```css
@media (max-width: 760px) and (min-width: 321px) and (min-height: 501px) {
  :root {
    --vk-floor-chrome-min-h: var(--vk-floor-chrome-min-h-2);
  }
  .floor-actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
/* Short landscape / short tablet — exclude ≤320px so tiny portrait keeps 2×3 */
@media (max-height: 500px) and (min-width: 321px) {
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
/* Last among these: 320px wins on 320×480 */
@media (max-width: 320px) {
  :root {
    --vk-floor-chrome-min-h: var(--vk-floor-chrome-min-h-3);
  }
  .floor-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

Always reserve a Close Day grid cell (`visibility: hidden` when not closable) so showing it does not change `--vk-floor-chrome-min-h`.

#### 4. Extreme zoom — bounded scrollport with one-CTA floor

Do **not** put `overflow-y: auto` on `#chrome-mount` itself.

1. Structure: `#chrome-mount` > `.floor-service-panel` > `.floor-actions-scroll` > `.floor-actions`.
2. Bound with additive `min` / `max`. The viewport term’s **lower bound is one CTA row** (`var(--vk-cta-h)`), not `0px` — a zero floor collapses the scrollport and makes every action unreachable:

```css
.floor-actions-scroll {
  max-height: min(
    var(--vk-floor-chrome-min-h-3),
    max(var(--vk-cta-h), calc(100dvh - var(--vk-status-hud-height, 2.75rem) - 8rem))
  );
  overflow-x: auto;
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

3. Internal scrolling only when content exceeds that bound (e.g. real **page/text zoom**). Below the bound, no scrollbar.
4. Tests prove the scrollport `max-height ≥ --vk-cta-h`. **Non-blocking implementation note:** under extreme zoom, the **final** action (last reserved control in source order, including the Close Day cell when present) must be scrollable **fully into view** and **activatable** (not merely the first visible CTA).

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
| Chromium | 320×568 | Tiny width — 2×3 grid, `min-h-3` |
| Chromium | **320×480** | Tiny **and** short — must still use 320px 2×3, **not** short-height one-row |
| Chromium | 667×375 | Short landscape — **one** row (`min-width: 321px`) |
| Chromium | 768×1024 | Tablet portrait |
| Chromium | 1280×800 | Desktop |
| Chromium | 390×844 @ **200% page zoom** | See zoom harness below |
| Firefox | 390×844 | Opt-in via `PLAYWRIGHT_BROWSERS` — **not** default CI |
| WebKit | 390×844 | **Unverified** — not in CI; sandbox cannot launch |

**200% zoom harness (required):** do **not** use Playwright `deviceScaleFactor` — that only changes DPR, not browser/page zoom or text scaling. Use one of:

1. Chromium: `page.evaluate(() => { document.documentElement.style.zoom = '2'; })` (or DevTools Protocol page zoom if available), **or**
2. Cross-engine text zoom proxy: `document.documentElement.style.fontSize = '200%'` when chrome sizing is rem-based enough to stress layout, documented as the Firefox/WebKit stand-in if `zoom` is unsupported.

Assert under that harness: scrollport `max-height ≥ --vk-cta-h`; the **final** action scrolls fully into view and can be activated (click/tap).

Assertions (relative):

- No tutorial/toast/arrival nodes in chrome.
- Four verbs present; Close Day reserved/hidden when not closable.
- Chrome `min-height` ≥ additive formula for the active plan (`min-h-1` / `min-h-2` / `min-h-3`).
- 320×480 keeps 2-column × 3-row plan; short landscape (wider than 320) keeps one-row min-height.
- 320px: no label overflow (`scrollWidth` of button ≤ client width + 1).
- Banner three-line clamp or `max-height` fallback holds.
- 200% zoom: overflow confined to bounded `.floor-actions-scroll`; `max-height ≥ --vk-cta-h`; **final** action fully in view and activatable.
- Canvas height unchanged across notice show/hide.
- Banner below HUD without double safe-area; pass-through taps; dismiss notice reveals celebration.

## Resolved decisions

| Topic | Decision |
|-------|----------|
| Banner offset | HUD height + 0.45rem only — **no** extra safe-area-top |
| CTA token | Use `--vk-cta-h` (52px in chibi `:root`); floor buttons must not hard-code 48px |
| Chrome height | Additive `min-h-1` / `min-h-2` / `min-h-3`; no typed multiplication |
| Short landscape | **One** row when `min-width: 321px` |
| 320px | 2 columns × **3** rows (`min-h-3`); wins over short-height |
| Two-row reserve | Narrow (321–760) **and** tall enough |
| Line clamp | `-webkit-line-clamp` + `line-clamp` + additive `max-height` fallback |
| Extreme zoom | Bounded scrollport with `max(var(--vk-cta-h), calc(...))` — never collapse below one CTA row |
| Extreme zoom (impl note) | Final action fully scrollable into view **and** activatable (non-blocking) |
| 200% zoom test | Real page/text zoom — **not** `deviceScaleFactor` |
| Three-button cap | Removed |
| Tutorial dismiss | Per-step until step changes |
| Timer while hidden | Pause on unmount **and** `visibilitychange` / BFCache `pagehide` |
| Tests | Desktop, tablet, 320, 320×480, short landscape, 200% zoom, Chromium CI; Firefox opt-in; **WebKit/iOS unverified** |
| WebKit / iOS | Not installed in CI; sandbox cannot launch WebKit — treat as open device-QA gap, not covered by “Implemented” |

## Implementation sketch (approved)

1. Notification timer + store fields; lifecycle helper (mount, visibility, pagehide/pageshow).
2. Banner: HUD-offset, stack, inert back, dwell-independent motion, three-line clamp fallback.
3. Floor chrome: additive `min-h-1`/`min-h-2`/`min-h-3`, short-height excludes ≤320px, 320px 2×3, `.floor-actions-scroll` floored at one CTA row, buttons `var(--vk-cta-h)`, remove messages/arrival/ticket strip; reserved Close Day cell.
4. Tests: unit lifecycle + matrix including 320×480, real 200% zoom (scrollport ≥ CTA; **final** action scrollIntoView + activate).
