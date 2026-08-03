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

/** Discard the first frame after a pause so elapsed hidden time cannot advance play. */
export function resumeSafeFloorDeltaMs(
  running: boolean,
  wasRunning: boolean,
  frameDeltaMs: number,
): number {
  return running && wasRunning ? Math.max(0, frameDeltaMs) : 0;
}
