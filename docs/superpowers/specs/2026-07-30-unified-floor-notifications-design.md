# Unified floor notifications (banner stack)

**Status:** Draft — awaiting user review  
**Date:** 2026-07-30  
**Related:** celebration queue (`CelebrationBanner`), `floorToast`, floor chrome layout (`--vk-floor-chrome-h`)

## Goal

All in-game status copy (toasts, tutorial steps, pacing hints) uses the **same top banner slot** as achievements/recipe celebrations. The bottom floor strip is **actions only**, so the restaurant canvas and chrome stop jumping when messages appear.

## Non-goals

- Redesigning celebration art, badge layout, or unlock rules.
- Changing ticket gameplay (selection still via Tickets dock / existing flows).
- Modal review / day-summary cards (those stay overlays; out of scope unless they later join this stack).

## UX

### Single visual slot

- One host, same place and card size as today’s celebration banner (`celebration-banner-host`, `min-height: 4.5rem`, centered under the status HUD).
- Every notice — toast, tutorial, pacing, recipe, mastery, achievement — renders as that same card chrome.
- Transient floor copy uses a lighter `notice` variant (same geometry; no achievement badge / ingredient icon row required).

### Stack (front covers back)

- At most **one front** card and **one back** card in the slot.
- Front is whatever the player must see now (usually a `notice`).
- Back is the paused celebration (or older notice) waiting underneath.
- Front paints over the back in the same footprint — not a second row, not a bottom toast.

```
[ Status HUD ]
[ Banner slot: FRONT notice  ]  ← dismissible; same size as achievements
[            (BACK celebration paused underneath) ]
[ Canvas … ]
[ Floor actions only ]
```

### Dismiss and reveal

- × / dismiss clears **only the front** card.
- If a back card exists, it becomes front and is shown; its auto-dismiss timer **resumes from remaining time**.
- A newer notice replaces the current front notice (does not dequeue celebrations). If a celebration was already on the back, it stays on the back.

### Timer pause (required)

- Auto-dismiss runs **only for the front** card.
- Any card moved to the back **pauses**; remaining ms are preserved.
- When it returns to front, the timer continues from the remainder (never from a full fresh duration unless newly enqueued).
- Player never loses an achievement/notice to auto-dismiss while it was covered.

### Durations (defaults)

| Kind | Front auto-dismiss |
|------|--------------------|
| `notice` (toast / tutorial / pacing) | ~2.5s (was `FLOOR_TOAST_MS` 2s; slight bump for readability) |
| `recipe` / `mastery` / `achievement` | 4s (`CELEBRATION_DURATION_MS`) |

Manual dismiss always allowed on the front card.

### Bottom chrome

- Floor strip contains **action buttons only** (Set table, Seat guest, Take orders, Clear table, Close Day).
- Remove from the strip: tutorial text, pacing text, floor toast row, and the inline ticket chip strip / “No tickets” empty copy (Tickets dock remains the ticket UI).
- Fixed chrome height can shrink to the action grid only — still fixed, not content-sized.

### What becomes a `notice`

| Source today | Behavior |
|--------------|----------|
| `setFloorToast(...)` | Enqueue/replace front `notice` |
| Day-1 `tutorialPrompt(...)` | Front `notice` when step text changes (replace prior tutorial notice) |
| Pacing / “first guest arriving…” | Front `notice` |
| Nav / layout blocked reasons | Front `notice` (same as toast) |
| Recipe / mastery / achievement | Unchanged enqueue into celebration queue; may sit on **back** while a notice is front |

Standing tutorial is **event-like**: push when the prompt string changes; do not spam every frame. If the step clears (`done`), dismiss that notice if it is still front/back with that body.

## Data model

Keep celebrations and notices separable so timing and priority stay clear:

```ts
type Notice = {
  id: string;
  title?: string; // optional; often omitted for short floor hints
  body: string;
  source: 'toast' | 'tutorial' | 'pacing' | 'system';
};

// Ephemeral UI (not persisted) — alongside celebrationQueue
noticeFront: Notice | null;
noticeBack: Notice | null; // rare; only if a notice was covered by a newer notice
// celebrations stay in celebrationQueue; head is “back” when noticeFront is set
```

**Front resolution for the banner host:**

1. If `noticeFront` → show as front.
2. Else if `celebrationQueue[0]` → show as front (today’s behavior).
3. Back layer (under front notice only): `celebrationQueue[0]` when `noticeFront` is set; else none.

Optional later: allow `noticeBack` if we need notice-over-notice; v1 can replace front notice and drop the previous notice (toasts are ephemeral). **Celebrations never drop when covered** — only pause.

## Banner host behavior

`CelebrationBanner` (rename conceptually to notification banner; keep testids stable or alias):

- Renders front card always when either notices or celebrations exist.
- When front is a notice **and** a celebration is waiting, celebration remains in the queue (not shifted) with timer paused.
- Dismiss front notice → `noticeFront = null` → celebration becomes visible and timer resumes.
- Dismiss front celebration → existing `dismissCelebration()` / queue advance.

## Canvas / layout

- No message-driven flex growth in chrome (actions-only fixed strip).
- Banner is absolutely positioned over the canvas/HUD gap — does not resize `#canvas-mount`.

## Testing

- Unit: pause/resume remaining time when notice covers celebration; dismiss notice reveals same celebration; celebration does not auto-fire while covered.
- Unit: `setFloorToast` / tutorial change drives `noticeFront`; not persisted in save snapshot.
- E2E: floor chrome has actions, no tutorial/toast nodes; canvas height stable; banner shows toast then achievement underneath after dismiss.

## Open decisions (resolved in this draft)

| Topic | Decision |
|-------|----------|
| Same size/location as achievements | Yes |
| Toast over achievement | Yes; dismiss reveals |
| Timer while covered | Paused with remaining time |
| Tutorial/pacing | Through same banner, not bottom strip |
| Bottom strip | Actions only |
| Notice-over-notice | Replace front; do not bury celebrations |

## Implementation sketch (after approval)

1. Store: notice front + celebration timer pause/resume API; route `setFloorToast` and tutorial/pacing publishers.
2. `CelebrationBanner`: stack render + shared card chrome for `notice`.
3. `FloorServiceHud`: strip actions-only; drop hints/toast/ticket strip.
4. Shrink `--vk-floor-chrome-h` to action grid; keep fixed.
5. Tests as above.
