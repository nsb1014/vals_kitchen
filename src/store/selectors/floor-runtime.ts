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
 * Cap hitch frames under the doorway e2e max visibility delta (~0.26): at
 * 2.4 tiles/s a 48ms step can still crest that band, so keep the cap at one
 * 30fps frame (33ms) with headroom.
 */
export const MAX_FLOOR_FRAME_DELTA_MS = 33;

/** Discard the first frame after a pause so elapsed hidden time cannot advance play. */
export function resumeSafeFloorDeltaMs(
  running: boolean,
  wasRunning: boolean,
  frameDeltaMs: number,
): number {
  if (!running || !wasRunning) return 0;
  return Math.min(Math.max(0, frameDeltaMs), MAX_FLOOR_FRAME_DELTA_MS);
}
