/** Presentation-only floor CTA icons + in-flight hold helpers. */

export type FloorCtaAction =
  | 'set-table'
  | 'seat'
  | 'take-orders'
  | 'clear'
  | 'close-day'
  | 'deliver';

/** Minimum time an instant CTA stays visually in-flight so the shimmer registers. */
export const FLOOR_CTA_MIN_IN_FLIGHT_MS = 520;

const ICON_SVGS: Record<FloorCtaAction, string> = {
  'set-table':
    '<svg class="floor-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 10h16v2H4zm2 3h3v5H7zm9 0h3v5h-3zM5 7h14l1 2H4z"/></svg>',
  seat: '<svg class="floor-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm8 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM4 14.5C4 12.57 7.13 11 11 11c.7 0 1.37.05 2 .15V20H4.75A.75.75 0 0 1 4 19.25v-4.75zm9.5-.35c.8-.1 1.64-.15 2.5-.15 3.87 0 7 1.57 7 3.5v4.25a.75.75 0 0 1-.75.75H13.5v-8.35z"/></svg>',
  'take-orders':
    '<svg class="floor-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7 3h10a2 2 0 0 1 2 2v14l-3-1.5L13 19l-3-1.5L7 19V5a2 2 0 0 1 2-2zm2 4v2h6V7H9zm0 4v2h6v-2H9zm0 4v2h4v-2H9z"/></svg>',
  clear:
    '<svg class="floor-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6 7h12v2H6zm1 3h10l-.7 9.1A2 2 0 0 1 14.31 21H9.69a2 2 0 0 1-1.99-1.9L7 10zm3-5h4l.5 1H9.5z"/></svg>',
  'close-day':
    '<svg class="floor-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3zm1 2.05V12h6.95A7.002 7.002 0 0 0 13 5.05z"/></svg>',
  deliver:
    '<svg class="floor-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 7h11v2H4zm0 4h9v2H4zm0 4h7v2H4zm12-5 5 4-5 4v-3h-3v-2h3z"/></svg>',
};

export function floorActionIconHtml(action: FloorCtaAction): string {
  return ICON_SVGS[action];
}

export function renderFloorActionLabelHtml(
  action: FloorCtaAction,
  label: string,
): string {
  return `${floorActionIconHtml(action)}<span class="floor-action-label">${label}</span>`;
}

export type CanvasInFlightBeat = 'seat' | 'walk' | string;

/**
 * Resolve whether a primary floor CTA should show persistent in-flight chrome.
 * Instant actions hold until `minHoldElapsed` (or capability flips to done).
 * Seat holds through canvas walk/`seat` beats and guest seating stage.
 */
export function resolveFloorCtaInFlight(input: {
  action: Exclude<FloorCtaAction, 'close-day' | 'deliver'>;
  pendingAction: FloorCtaAction | null;
  seatingInFlight: boolean;
  seatActionSawSeating: boolean;
  canvasBeat: CanvasInFlightBeat | null | undefined;
  /** True once the action's enabling condition has cleared (success). */
  actionCompleted: boolean;
  minHoldElapsed: boolean;
}): { inFlight: boolean; clearPending: boolean; sawSeating: boolean } {
  const { action, pendingAction } = input;
  if (action === 'seat') {
    const pendingSeat = pendingAction === 'seat';
    const canvasSeat =
      input.canvasBeat === 'seat' ||
      (pendingSeat && input.canvasBeat === 'walk');
    const inFlight =
      input.seatingInFlight || pendingSeat || Boolean(canvasSeat);
    let sawSeating = input.seatActionSawSeating;
    if (input.seatingInFlight) sawSeating = true;
    let clearPending = false;
    if (pendingSeat) {
      if (sawSeating && !input.seatingInFlight) {
        clearPending = true;
      } else if (
        !input.seatingInFlight &&
        !canvasSeat &&
        input.minHoldElapsed &&
        !sawSeating
      ) {
        // Walk never started or was cancelled — release after min hold.
        clearPending = true;
      }
    }
    return { inFlight, clearPending, sawSeating };
  }

  const pending = pendingAction === action;
  if (!pending) {
    return { inFlight: false, clearPending: false, sawSeating: false };
  }
  // Instant CTAs: keep shimmer for the min hold so it registers, then release
  // once the hold elapses (success usually flips capability in the same beat).
  const clearPending = input.minHoldElapsed;
  return {
    inFlight: !clearPending,
    clearPending,
    sawSeating: false,
  };
}

/** Read canvas `data-in-flight` without depending on RestaurantApp internals. */
export function readFloorCanvasInFlight(
  root: Document | Element | null | undefined = typeof document !== 'undefined'
    ? document
    : null,
): CanvasInFlightBeat | null {
  if (!root) return null;
  const canvas = root.querySelector(
    '[data-testid="restaurant-canvas"]',
  ) as HTMLElement | null;
  const beat = canvas?.dataset.inFlight?.trim();
  return beat || null;
}
