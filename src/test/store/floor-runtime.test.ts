import { describe, expect, it } from 'vitest';
import type { ActiveDay } from '../../domain/day/types.ts';
import type { FloorDay } from '../../domain/floor/types.ts';
import {
  FLOOR_RESUME_SETTLE_FRAMES,
  MAX_FLOOR_FRAME_DELTA_MS,
  resumeSafeFloorDeltaMs,
  selectFloorRuntimeRunning,
  type FloorRuntimeState,
} from '../../store/selectors/floor-runtime.ts';

function activeDayWithFloor(): ActiveDay {
  return { floor: {} as FloorDay } as ActiveDay;
}

function runtimeState(
  overrides: Partial<FloorRuntimeState> = {},
): FloorRuntimeState {
  return {
    screen: 'restaurant',
    activeDay: activeDayWithFloor(),
    modifierDismissed: true,
    pendingReview: null,
    ceremony: null,
    daySummary: null,
    ...overrides,
  };
}

describe('floor runtime gate', () => {
  it('runs on a visible restaurant floor after the modifier is dismissed', () => {
    expect(selectFloorRuntimeRunning(runtimeState(), true)).toBe(true);
  });

  it.each([
    ['hidden document', runtimeState(), false],
    ['another screen', runtimeState({ screen: 'recipes' }), true],
    ['no active day', runtimeState({ activeDay: null }), true],
    [
      'active day without a floor',
      runtimeState({ activeDay: { ...activeDayWithFloor(), floor: null } }),
      true,
    ],
    ['undismissed modifier', runtimeState({ modifierDismissed: false }), true],
    [
      'pending review',
      runtimeState({
        pendingReview: {} as NonNullable<FloorRuntimeState['pendingReview']>,
      }),
      true,
    ],
    ['ceremony', runtimeState({ ceremony: 'prestige' }), true],
    [
      'day summary',
      runtimeState({
        daySummary: {} as NonNullable<FloorRuntimeState['daySummary']>,
      }),
      true,
    ],
  ] as const)('pauses for %s', (_label, state, documentVisible) => {
    expect(selectFloorRuntimeRunning(state, documentVisible)).toBe(false);
  });

  it('does not treat compose or ticket surfaces as runtime blockers', () => {
    const stateWithConcurrentSurfaces = {
      ...runtimeState(),
      composeSheetOpen: true,
      ticketsMenuOpen: true,
    };

    expect(selectFloorRuntimeRunning(stateWithConcurrentSurfaces, true)).toBe(
      true,
    );
  });
});

describe('floor runtime resume delta', () => {
  it('uses ordinary deltas only while continuously running', () => {
    expect(resumeSafeFloorDeltaMs(true, true, 16, 0).deltaMs).toBe(16);
    expect(resumeSafeFloorDeltaMs(true, true, -1, 0).deltaMs).toBe(0);
  });

  it('drops paused and first-resume deltas to prevent hidden-time catch-up', () => {
    expect(resumeSafeFloorDeltaMs(false, true, 5_000, 0).deltaMs).toBe(0);
    expect(
      resumeSafeFloorDeltaMs(false, true, 5_000, 0).resumeSettleFramesRemaining,
    ).toBe(FLOOR_RESUME_SETTLE_FRAMES);
    expect(resumeSafeFloorDeltaMs(true, false, 5_000, 0).deltaMs).toBe(0);
    expect(
      resumeSafeFloorDeltaMs(true, false, 5_000, 0).resumeSettleFramesRemaining,
    ).toBe(FLOOR_RESUME_SETTLE_FRAMES);
  });

  it('gates one settled frame after resume before walk-lerp resumes', () => {
    const afterResume = resumeSafeFloorDeltaMs(true, false, 5_000, 0);
    expect(afterResume.deltaMs).toBe(0);
    const settle = resumeSafeFloorDeltaMs(
      true,
      true,
      16,
      afterResume.resumeSettleFramesRemaining,
    );
    expect(settle.deltaMs).toBe(0);
    expect(settle.resumeSettleFramesRemaining).toBe(0);
    expect(resumeSafeFloorDeltaMs(true, true, 16, 0).deltaMs).toBe(16);
  });

  it('caps hitch frames so doorway / approach beats stay time-rate limited', () => {
    expect(resumeSafeFloorDeltaMs(true, true, 200, 0).deltaMs).toBe(
      MAX_FLOOR_FRAME_DELTA_MS,
    );
    expect(
      resumeSafeFloorDeltaMs(true, true, MAX_FLOOR_FRAME_DELTA_MS, 0).deltaMs,
    ).toBe(MAX_FLOOR_FRAME_DELTA_MS);
  });
});
