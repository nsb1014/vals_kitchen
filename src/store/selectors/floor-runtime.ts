import type { GameStore } from '../game-store.ts';

export type FloorRuntimeState = Pick<
  GameStore,
  | 'screen'
  | 'activeDay'
  | 'modifierDismissed'
  | 'pendingReview'
  | 'ceremony'
  | 'daySummary'
>;

/**
 * The floor simulation and its canvas controls share this single gate.
 * Compose and ticket surfaces are intentionally absent: service continues
 * while players inspect an order or assemble a dish.
 */
export function selectFloorRuntimeRunning(
  state: FloorRuntimeState,
  documentVisible: boolean,
): boolean {
  return Boolean(
    documentVisible &&
    state.screen === 'restaurant' &&
    state.activeDay?.floor &&
    state.modifierDismissed &&
    !state.pendingReview &&
    !state.ceremony &&
    !state.daySummary,
  );
}

/**
 * Cap a single ticker frame so CI hitch / background catch-up cannot jump
 * doorway crop fractions or approach holds by more than ~one tile substep.
 * Doorway continuity e2e samples per rAF and rejects per-frame visibility
 * deltas above ~0.26; uncapped 100ms+ frames at 2.4 tiles/s overshoot that.
 */
export const MAX_FLOOR_FRAME_DELTA_MS = 48;

/** Discard the first frame after a pause so elapsed hidden time cannot advance play. */
export function resumeSafeFloorDeltaMs(
  running: boolean,
  wasRunning: boolean,
  frameDeltaMs: number,
): number {
  if (!running || !wasRunning) return 0;
  return Math.min(Math.max(0, frameDeltaMs), MAX_FLOOR_FRAME_DELTA_MS);
}
