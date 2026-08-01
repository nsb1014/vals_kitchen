import { describe, expect, it } from 'vitest';
import {
  useGameStore,
  type GameStore,
  type ServeReview,
} from '../../store/game-store.ts';
import { selectNotificationUiBlocked } from '../../ui/components/CelebrationBanner.ts';
import '../test-helpers.ts';

function stateWith(overrides: Partial<GameStore>): GameStore {
  return {
    ...useGameStore.getState(),
    screen: 'restaurant',
    composeSheetOpen: false,
    pendingReview: null,
    daySummary: null,
    ceremony: null,
    ...overrides,
  };
}

describe('notification service-overlay blocking', () => {
  it('blocks the review and day summary only where those sheets render', () => {
    const review = {} as ServeReview;
    const summary = {} as NonNullable<GameStore['daySummary']>;

    expect(selectNotificationUiBlocked(stateWith({ pendingReview: review }))).toBe(
      true,
    );
    expect(selectNotificationUiBlocked(stateWith({ daySummary: summary }))).toBe(
      true,
    );
    expect(
      selectNotificationUiBlocked(
        stateWith({ screen: 'settings', pendingReview: review }),
      ),
    ).toBe(false);
    expect(
      selectNotificationUiBlocked(
        stateWith({ screen: 'recipes', daySummary: summary }),
      ),
    ).toBe(false);
  });

  it('blocks a ceremony independently of the active screen', () => {
    expect(
      selectNotificationUiBlocked(
        stateWith({ screen: 'settings', ceremony: 'soft_reset' }),
      ),
    ).toBe(true);
  });
});
