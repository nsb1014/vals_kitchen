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

/**
 * After a pause, hold this many additional zero-delta frames once running
 * resumes so walk-lerp / doorway crop do not inherit a hitch-sized jump on
 * the first sampled RAF after Settings/review teardown.
 */
export const FLOOR_RESUME_SETTLE_FRAMES = 1;

/** Discard the first frame after a pause so elapsed hidden time cannot advance play. */
export function resumeSafeFloorDeltaMs(
  running: boolean,
  wasRunning: boolean,
  frameDeltaMs: number,
  resumeSettleFramesRemaining = 0,
): { deltaMs: number; resumeSettleFramesRemaining: number } {
  if (!running) {
    return { deltaMs: 0, resumeSettleFramesRemaining: FLOOR_RESUME_SETTLE_FRAMES };
  }
  if (!wasRunning) {
    // Classic resume-safe frame: drop the pause gap entirely.
    return {
      deltaMs: 0,
      resumeSettleFramesRemaining: FLOOR_RESUME_SETTLE_FRAMES,
    };
  }
  if (resumeSettleFramesRemaining > 0) {
    // Gate walk-lerp for one settled frame after resume so crop fraction
    // samples cannot include a post-pause spike over the 0.26 band.
    return {
      deltaMs: 0,
      resumeSettleFramesRemaining: resumeSettleFramesRemaining - 1,
    };
  }
  return {
    deltaMs: Math.min(Math.max(0, frameDeltaMs), MAX_FLOOR_FRAME_DELTA_MS),
    resumeSettleFramesRemaining: 0,
  };
}
