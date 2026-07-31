# Unified Floor Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all floor status copy into the shared top banner stack and make the bottom chrome an actions-only, token-sized bar so the restaurant canvas stops jumping when messages appear.

**Architecture:** Store-owned notice + celebration timers (`notification-timer` + surface lifecycle) own dwell; the banner host only renders front/back cards and reports surface activity. `FloorServiceHud` syncs tutorial/pacing into notices and renders five reserved actions inside a bounded `.floor-actions-scroll`. CSS uses additive `min-h-1`/`min-h-2`/`min-h-3` with 320px winning over short-height.

**Tech Stack:** TypeScript, Zustand (`useGameStore`), vanilla DOM UI, Vitest fake timers, Playwright (Chromium required; WebKit/Firefox when browsers available).

**Spec:** `docs/superpowers/specs/2026-07-30-unified-floor-notifications-design.md` (Approved v7).

## Global Constraints

- Banner offset: `top: calc(var(--vk-status-hud-height, 2.75rem) + 0.45rem)` — **no** extra `env(safe-area-inset-top)`.
- CTA height: `var(--vk-cta-h)` (chibi **52px**); do not hard-code 48px on floor buttons.
- Transient notice dwell: **2500ms**; celebration dwell: **4000ms** while front.
- Scrollport floor: `max(var(--vk-cta-h), calc(...))` — never `0px`.
- Non-blocking impl note: under extreme zoom, the **final** action must scroll fully into view and activate.
- Do **not** add canvas tap handlers for set/seat/order/clear; do **not** reintroduce a three-button cap.
- Do not weaken tests. Prefer `node node_modules/.bin/<tool>` (npm may be missing from PATH).
- `floorToast` / notice / tutorial dismiss fields are ephemeral (`META_KEYS`); never persist.

## File map

| Area | Create / modify |
|------|-----------------|
| Notice types + timer | Create `src/store/notification-timer.ts`; modify `src/store/game-store.ts` |
| Surface lifecycle | Create `src/ui/notifications/surface-lifecycle.ts` |
| Banner UI | Modify `src/ui/components/CelebrationBanner.ts` (or rename host to unified banner; keep testid stable where possible) |
| Floor HUD | Modify `src/ui/components/FloorServiceHud.ts` |
| CSS | Modify `src/ui/styles/global.css`, `src/ui/styles/service-day.css` |
| Toast producers | Keep `setFloorToast` API; reimplement as notice enqueue |
| E2E bridge (optional) | `src/app/e2e-bridge.ts` — expose notice/celebration helpers if needed |
| Unit tests | Create `src/test/notifications/notification-timer.test.ts`; update `src/test/celebration-queue.test.ts`, `src/test/floor/toast.test.ts` |
| E2E | Create `tests/e2e/floor-notifications.spec.ts`; extend `playwright.config.ts` projects when browsers exist |

---

### Task 1: Notice model + notification timer (store)

**Files:**
- Create: `src/store/notification-timer.ts`
- Modify: `src/store/game-store.ts`
- Test: `src/test/notifications/notification-timer.test.ts`
- Update: `src/test/celebration-queue.test.ts`, `src/test/floor/toast.test.ts`

**Interfaces:**
- Produces:
  - `export type NoticeSource = 'tutorial' | 'pacing' | 'toast' | 'system';`
  - `export interface Notice { id: string; source: NoticeSource; title?: string; body: string; stepId?: TutorialStepId; }`
  - `export const NOTICE_DURATION_MS = 2500;`
  - `export const CELEBRATION_DURATION_MS = 4000;` (move or re-export from store)
  - Store fields: `noticeActive`, `noticeSticky`, `tutorialDismissedStepId`, `notificationSurfaceActive`, celebration queue unchanged shape
  - APIs: `setFloorToast(message)`, `syncFloorNoticesFromHud(...)`, `dismissFrontNotice()`, `dismissCelebration()`, `setNotificationSurfaceActive(active: boolean)`, `syncNotificationTimer()`

- [ ] **Step 1: Write failing timer tests**

Create `src/test/notifications/notification-timer.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../store/game-store.ts';

describe('notification timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockReturnValue(0);
    useGameStore.setState({
      noticeActive: null,
      noticeSticky: null,
      tutorialDismissedStepId: null,
      notificationSurfaceActive: true,
      celebrationQueue: [],
      floorToast: null,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears transient toast after 2500ms when surface active', () => {
    useGameStore.getState().setFloorToast('Blocked');
    expect(useGameStore.getState().noticeActive?.body).toBe('Blocked');
    vi.advanceTimersByTime(2499);
    expect(useGameStore.getState().noticeActive?.body).toBe('Blocked');
    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().noticeActive).toBeNull();
  });

  it('extends dwell when the same toast body is set again', () => {
    useGameStore.getState().setFloorToast('Blocked');
    vi.advanceTimersByTime(2000);
    useGameStore.getState().setFloorToast('Blocked');
    vi.advanceTimersByTime(2000);
    expect(useGameStore.getState().noticeActive?.body).toBe('Blocked');
    vi.advanceTimersByTime(500);
    expect(useGameStore.getState().noticeActive).toBeNull();
  });

  it('pauses celebration while a notice is front and resumes remainingMs', () => {
    useGameStore.getState().enqueueCelebration({
      kind: 'recipe',
      title: 'Pasta',
      body: 'Unlocked',
    });
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(1000);
    // advance 1000ms into celebration
    vi.advanceTimersByTime(1000);
    useGameStore.getState().setFloorToast('Cover');
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(5000);
    vi.advanceTimersByTime(4000); // wall clock while covered must not dismiss celebration
    expect(useGameStore.getState().celebrationQueue).toHaveLength(1);
    // dismiss notice → celebration resumes with ~3000ms left
    useGameStore.getState().dismissFrontNotice();
    vi.advanceTimersByTime(2999);
    expect(useGameStore.getState().celebrationQueue).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().celebrationQueue).toHaveLength(0);
  });

  it('pauses when notificationSurfaceActive becomes false', () => {
    useGameStore.getState().setFloorToast('Hi');
    useGameStore.getState().setNotificationSurfaceActive(false);
    vi.advanceTimersByTime(10_000);
    expect(useGameStore.getState().noticeActive?.body).toBe('Hi');
    useGameStore.getState().setNotificationSurfaceActive(true);
    vi.advanceTimersByTime(2500);
    expect(useGameStore.getState().noticeActive).toBeNull();
  });

  it('does not re-show dismissed tutorial until step changes', () => {
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: {
        id: 't1',
        source: 'tutorial',
        body: 'Set a table',
        stepId: 'set-table',
      },
      pacing: null,
    });
    useGameStore.getState().dismissFrontNotice(); // sets tutorialDismissedStepId
    expect(useGameStore.getState().noticeSticky).toBeNull();
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: {
        id: 't1',
        source: 'tutorial',
        body: 'Set a table',
        stepId: 'set-table',
      },
      pacing: null,
    });
    expect(useGameStore.getState().noticeSticky).toBeNull();
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: {
        id: 't2',
        source: 'tutorial',
        body: 'Seat a guest',
        stepId: 'seat-guest',
      },
      pacing: null,
    });
    expect(useGameStore.getState().noticeSticky?.stepId).toBe('seat-guest');
  });
});
```

Adjust `TutorialStepId` literals to match `src/domain/floor/tutorial.ts`.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node node_modules/.bin/vitest run src/test/notifications/notification-timer.test.ts
```

Expected: FAIL (missing APIs / fields).

- [ ] **Step 3: Implement timer module + wire store**

In `notification-timer.ts`, own module-level timeout handles and `TimerFields` for notice transient and celebration head. Rules from spec:

- Front for dwell = `noticeActive` if set, else celebration head.
- `setFloorToast(msg)` → enqueue/replace transient notice `source: 'toast'`; keep `floorToast` mirrored for any legacy readers **or** derive `floorToast` from `noticeActive` during migration (prefer single source: set both or deprecate read of `floorToast` in HUD).
- Duplicate same body → reset `remainingMs` to `NOTICE_DURATION_MS`.
- Sticky tutorial via `syncFloorNoticesFromHud`; transient covers sticky; sticky returns when transient ends unless dismissed.
- `setNotificationSurfaceActive(false)` pauses front (subtract elapsed, clear `runningSinceMs`, cancel timeout).
- Day teardown / hydrate / open-day / close-day: clear notices + timers (same sites that clear `floorToast` today).
- Replace `syncCelebrationTimer` / `FLOOR_TOAST_MS` paths with `syncNotificationTimer`.

Keep `enqueueCelebration` / `dismissCelebration` / `clearCelebrations` public; celebration auto-advance only when uncovered + surface active.

- [ ] **Step 4: Update existing toast/celebration tests for 2500ms notice dwell and pause semantics**

- `src/test/floor/toast.test.ts`: still excludes from save; auto-clear at 2500ms (was 2000).
- `src/test/celebration-queue.test.ts`: FIFO still works when surface active and no notice; add/adjust for pause-under-notice if timing assertions break.

- [ ] **Step 5: Run unit tests and commit**

```bash
node node_modules/.bin/vitest run src/test/notifications/notification-timer.test.ts src/test/floor/toast.test.ts src/test/celebration-queue.test.ts
```

```bash
git add src/store/notification-timer.ts src/store/game-store.ts src/test/notifications/notification-timer.test.ts src/test/floor/toast.test.ts src/test/celebration-queue.test.ts
git commit -m "feat: store-owned notice and celebration notification timer"
```

---

### Task 2: Surface lifecycle helper

**Files:**
- Create: `src/ui/notifications/surface-lifecycle.ts`
- Test: extend `src/test/notifications/notification-timer.test.ts` or add `src/test/notifications/surface-lifecycle.test.ts` (jsdom not configured — prefer testing via store API from a thin helper that accepts `Document`-like callbacks, or unit-test the helper with mocked `addEventListener`).

**Interfaces:**
- Consumes: `setNotificationSurfaceActive`, `syncNotificationTimer` from store
- Produces:
  ```ts
  export function bindNotificationSurfaceLifecycle(opts: {
    isHostConnected: () => boolean;
    setActive: (active: boolean) => void;
    doc?: Document;
  }): () => void;
  ```
  Active iff `isHostConnected() && visibilityState === 'visible' && !bfcacheHidden`.

- [ ] **Step 1: Write failing test for pagehide pause / pageshow resume**

Use a fake document event target; assert `setActive(false)` on `pagehide` and `visibilitychange`→hidden; `setActive(true)` on `pageshow` / visible when host connected.

- [ ] **Step 2: Implement helper**

Listen: `visibilitychange`, `pagehide`, `pageshow`. On each event recompute active and call `setActive`. Return unsubscribe that removes listeners.

- [ ] **Step 3: Run tests; commit**

```bash
git add src/ui/notifications/surface-lifecycle.ts src/test/notifications/
git commit -m "feat: pause notification timers on hidden and BFCache pagehide"
```

---

### Task 3: Unified banner host (stack + CSS)

**Files:**
- Modify: `src/ui/components/CelebrationBanner.ts`
- Modify: `src/ui/styles/global.css` (banner host placement, clamp, pointer-events, motion)
- Keep mount site in `src/ui/components/ServiceDayUi.ts`

**Interfaces:**
- Consumes: `noticeActive`, `celebrationQueue[0]`, `dismissFrontNotice`, `dismissCelebration`, lifecycle helper
- Produces: updated `mountCelebrationBanner` that renders notice front over celebration back

- [ ] **Step 1: CSS — HUD offset, three-line clamp, pass-through, short motion**

```css
.celebration-banner-host {
  top: calc(var(--vk-status-hud-height, 2.75rem) + 0.45rem);
  /* remove any env(safe-area-inset-top) if present */
  pointer-events: none;
}
.celebration-banner,
.notice-banner {
  pointer-events: none; /* only dismiss button is auto */
}
.celebration-banner-dismiss,
.notice-banner-dismiss {
  pointer-events: auto;
}
.celebration-banner-body,
.notice-banner-body {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  line-height: 1.25;
  max-height: calc(1.25em + 1.25em + 1.25em);
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
```

Decouple entrance animation from 4s dwell (short keyframes; `prefers-reduced-motion: reduce` → no animation). Covered back card: `aria-hidden`, `inert`, no end-of-dwell fade.

- [ ] **Step 2: Render stack**

- If `noticeActive`: front notice card (`data-testid="notice-banner"`), dismiss → `dismissFrontNotice()`.
- If celebration head exists: render under/with notice; when notice present, celebration gets `inert` + `aria-hidden`.
- Subscribe to notice + celebration fields.
- On mount: `setNotificationSurfaceActive(true)` + `bindNotificationSurfaceLifecycle`; on unmount: `setActive(false)` and unbind.

- [ ] **Step 3: Manual sanity via existing unit timer tests + typecheck**

```bash
node node_modules/.bin/tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/CelebrationBanner.ts src/ui/styles/global.css src/ui/notifications/
git commit -m "feat: banner stack with notice front and HUD-offset host"
```

---

### Task 4: FloorServiceHud — actions-only chrome + notice sync

**Files:**
- Modify: `src/ui/components/FloorServiceHud.ts`
- Modify: `src/ui/styles/service-day.css`, `src/ui/styles/global.css` (chrome min-height tokens)

**Interfaces:**
- Consumes: `syncFloorNoticesFromHud`, selectors for verbs / `selectCanCloseDay`
- Produces: DOM structure `#chrome-mount` > `.floor-service-panel` > `.floor-actions-scroll` > `.floor-actions` with five reserved cells

- [ ] **Step 1: Remove chrome message UI**

Delete from render:
- `.floor-tutorial` / pacing paragraph rows
- `.floor-toast`
- inline `.floor-ticket-strip` / “No tickets”
- entire `initialGuestArriving` arrival panel branch (emit pacing/system notice via sync instead; keep tickets dock behavior)

Keep tickets **dock** in overlay host.

- [ ] **Step 2: Sync notices each render**

```ts
const step = nextTutorialStep(floor, state.day === 1);
const prompt = tutorialPrompt(step);
const sticky =
  prompt && step
    ? { id: `tutorial:${step}`, source: 'tutorial' as const, body: prompt, stepId: step }
    : null;
const pacing = /* day2+ hint or arriving copy */ null | { id, source: 'pacing', body };
useGameStore.getState().syncFloorNoticesFromHud({ sticky, pacing });
```

Arriving-first-guest copy becomes a pacing/system notice, not a chrome replacement.

- [ ] **Step 3: Always render five action cells**

Order: Set, Seat, Take orders, Clear, Close Day. When `!selectCanCloseDay`, keep the button in grid with `visibility: hidden` (or `hidden` attribute that still occupies grid — prefer `visibility: hidden` + `aria-hidden` so layout reserve holds). Do not remove the node.

Enable/disable the four verbs via existing selectors.

- [ ] **Step 4: CSS tokens + media queries (exact from spec § Token-derived sizing)**

Add `--vk-floor-chrome-min-h-1/2/3`, `.chrome-mount:not([hidden]) { min-height: var(--vk-floor-chrome-min-h); }`, narrow/tall 2-row, short-height `min-width: 321px`, **last** `max-width: 320px` → `min-h-3` + 2 columns.

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
.floor-actions .service-btn {
  min-height: var(--vk-cta-h);
  height: auto;
  white-space: normal;
  /* remove chibi hard-coded 48px for these buttons */
}
```

- [ ] **Step 5: Typecheck + existing floor unit tests; commit**

```bash
node node_modules/.bin/tsc --noEmit
node node_modules/.bin/vitest run src/test/floor/
git add src/ui/components/FloorServiceHud.ts src/ui/styles/service-day.css src/ui/styles/global.css
git commit -m "feat: actions-only floor chrome with token min-heights"
```

---

### Task 5: E2E matrix + extreme-zoom final action

**Files:**
- Create: `tests/e2e/floor-notifications.spec.ts`
- Modify: `tests/e2e/helpers.ts` (add zoom harness + scrollport assertions)
- Modify: `playwright.config.ts` — add `webkit` / `firefox` projects **only if** browsers install successfully; otherwise Chromium matrix + document skip for other engines in the spec comment
- Optional: `src/app/e2e-bridge.ts` helpers to enqueue notice/celebration

- [ ] **Step 1: Helper — real page zoom (not deviceScaleFactor)**

```ts
export async function applyPageZoom(page: Page, factor: 2): Promise<void> {
  await page.evaluate((z) => {
    document.documentElement.style.zoom = String(z);
  }, factor);
}

export async function assertScrollportAtLeastCta(page: Page): Promise<void> {
  const ok = await page.evaluate(() => {
    const scroll = document.querySelector('.floor-actions-scroll') as HTMLElement | null;
    if (!scroll) return false;
    const cta = getComputedStyle(document.documentElement).getPropertyValue('--vk-cta-h').trim();
    const ctaPx = parseFloat(cta) || 52;
    return scroll.getBoundingClientRect().height + 0.5 >= ctaPx;
  });
  expect(ok).toBe(true);
}

/** Non-blocking impl note: last reserved action fully in view and clickable */
export async function assertFinalFloorActionActivatable(page: Page): Promise<void> {
  const last = page.locator('.floor-actions .service-btn').last();
  await last.evaluate((el) => el.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  await expect(last).toBeVisible();
  const box = await last.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;
  const scroll = page.locator('.floor-actions-scroll');
  const sbox = await scroll.boundingBox();
  expect(sbox).toBeTruthy();
  if (!sbox) return;
  expect(box.y).toBeGreaterThanOrEqual(sbox.y - 1);
  expect(box.y + box.height).toBeLessThanOrEqual(sbox.y + sbox.height + 1);
  await last.click({ force: false });
}
```

- [ ] **Step 2: Spec covering viewports**

For each Chromium viewport in the design matrix (390×844, 320×568, 320×480, 667×375, 768×1024, 1280×800):

- Open day / reach floor chrome (reuse smoke helpers).
- Assert no `.floor-tutorial`, `.floor-toast`, `[data-testid=floor-arrival-panel]` in chrome.
- Assert four verbs present; Close Day reserved (hidden or visibility hidden) when not closable.
- Assert chrome `min-height` matches active plan (sample computed style / CSS variable).
- **320×480:** grid columns = 2; `--vk-floor-chrome-min-h` resolves to three-row token (not one-row).
- **667×375:** one-row min-height.
- Canvas height stable across `setFloorToast` show/hide (bridge or evaluate store).

200% zoom case on 390×844:

```ts
await page.setViewportSize({ width: 390, height: 844 });
await applyPageZoom(page, 2);
await assertScrollportAtLeastCta(page);
await assertFinalFloorActionActivatable(page);
```

Banner checks: host `top` uses HUD variable; three-line clamp computed; dismiss notice reveals celebration when both queued via bridge.

- [ ] **Step 3: Run Chromium E2E**

```bash
node node_modules/.bin/playwright test tests/e2e/floor-notifications.spec.ts
```

- [ ] **Step 4: Attempt WebKit/Firefox projects**

If `npx playwright install webkit firefox` fails in sandbox, keep Chromium green and note in PR; do not fake multi-engine with DPR.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/floor-notifications.spec.ts tests/e2e/helpers.ts playwright.config.ts src/app/e2e-bridge.ts
git commit -m "test: floor notification responsive matrix and extreme-zoom final action"
```

---

### Task 6: Docs / Progress touch-up

**Files:**
- Modify: `docs/Progress.md` (one bullet: unified floor notifications implemented)
- Spec already Approved v7 — no status change required unless implementation complete → mark “Implemented”

- [ ] **Step 1:** When Tasks 1–5 are green, set spec status to Implemented and update Progress.
- [ ] **Step 2:** Commit.

```bash
git commit -m "docs: mark unified floor notifications implemented"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Notice + celebration stack, HUD offset, no double safe-area | 3 |
| Timer pause cover / hidden / pagehide; resume remainingMs | 1–2 |
| Tutorial sticky + per-step dismiss | 1, 4 |
| Transient 2500ms; celebration 4000ms while front | 1 |
| Actions-only chrome; remove toast/tutorial/arrival/ticket strip | 4 |
| min-h-1/2/3; 320px 2×3 wins; short-height ≥321px | 4 |
| Scrollport floor one CTA; final action activatable under zoom | 4–5 |
| Three-line clamp fallback | 3 |
| Unit + E2E matrix | 1, 5 |
| No new canvas handlers / no three-button cap | 4 (explicit non-goal) |
