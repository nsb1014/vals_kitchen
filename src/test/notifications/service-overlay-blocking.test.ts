import { describe, expect, it } from 'vitest';
import {
  useGameStore,
  type GameStore,
  type ServeReview,
} from '../../store/game-store.ts';
import { selectNotificationUiBlocked } from '../../ui/components/CelebrationBanner.ts';
import { hasLocalNotificationBlockingSurface } from '../../ui/notifications/blocking-surface.ts';
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

  it('derives local blocking from the actually rendered ticket or shop surface', () => {
    let selector = '';
    const openMenuDocument = {
      querySelector: (value: string) => {
        selector = value;
        return { id: 'floor-tickets-menu' };
      },
    } as unknown as Document;
    const closedMenuDocument = {
      querySelector: () => null,
    } as unknown as Document;

    expect(hasLocalNotificationBlockingSurface(openMenuDocument)).toBe(true);
    expect(selector).toContain('#floor-tickets-menu:not([hidden])');
    expect(selector).toContain('#layout-catalog-sheet:not([hidden])');
    expect(selector).toContain('.chat-bubble.order-bubble:not([hidden])');
    expect(hasLocalNotificationBlockingSurface(closedMenuDocument)).toBe(false);
  });
});
