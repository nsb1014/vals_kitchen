import { describe, expect, it } from 'vitest';
import { selectShowFloorInteractionCues } from '../../store/selectors/service-day.ts';

function state(
  patch: Partial<Parameters<typeof selectShowFloorInteractionCues>[0]> = {},
): Parameters<typeof selectShowFloorInteractionCues>[0] {
  return {
    screen: 'restaurant',
    activeDay: { floor: {} } as never,
    modifierDismissed: true,
    pendingReview: null,
    daySummary: null,
    ceremony: null,
    composeSheetOpen: false,
    editLayoutMode: false,
    ...patch,
  };
}

describe('floor interaction cue visibility', () => {
  it('shows cues only on an unobstructed live restaurant floor', () => {
    expect(selectShowFloorInteractionCues(state())).toBe(true);
    expect(selectShowFloorInteractionCues(state({ screen: 'shop' }))).toBe(false);
    expect(selectShowFloorInteractionCues(state({ activeDay: null }))).toBe(false);
    expect(selectShowFloorInteractionCues(state({ modifierDismissed: false }))).toBe(false);
    expect(selectShowFloorInteractionCues(state({ editLayoutMode: true }))).toBe(false);
  });

  it('hides stale world cues behind every interaction-owning sheet', () => {
    expect(selectShowFloorInteractionCues(state({ composeSheetOpen: true }))).toBe(false);
    expect(selectShowFloorInteractionCues(state({ pendingReview: {} as never }))).toBe(false);
    expect(selectShowFloorInteractionCues(state({ daySummary: {} as never }))).toBe(false);
    expect(selectShowFloorInteractionCues(state({ ceremony: 'prestige' }))).toBe(false);
  });
});
