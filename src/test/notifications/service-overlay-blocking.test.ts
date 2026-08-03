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

    expect(
      selectNotificationUiBlocked(stateWith({ pendingReview: review })),
    ).toBe(true);
    expect(
      selectNotificationUiBlocked(stateWith({ daySummary: summary })),
    ).toBe(true);
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
    expect(selector).toContain('#floor-tickets-menu');
    expect(selector).toContain('#layout-catalog-sheet');
    expect(selector).toContain('.chat-bubble.order-bubble');
    expect(hasLocalNotificationBlockingSurface(closedMenuDocument)).toBe(false);
  });

  it('ignores candidates hidden by their own state or an ancestor', () => {
    const element = (
      attributes: Record<string, string>,
      parentElement: Element | null = null,
    ) =>
      ({
        parentElement,
        hasAttribute: (name: string) => name in attributes,
        getAttribute: (name: string) => attributes[name] ?? null,
      }) as unknown as Element;
    const ariaHiddenParent = element({ 'aria-hidden': 'true' });
    const inertParent = element({ inert: '' });
    const candidates = [
      element({}, ariaHiddenParent),
      element({}, inertParent),
      element({ hidden: '' }),
    ];
    const hiddenDocument = {
      querySelectorAll: () => candidates,
      defaultView: {
        getComputedStyle: () => ({
          display: 'block',
          visibility: 'visible',
        }),
      },
    } as unknown as Document;

    expect(hasLocalNotificationBlockingSurface(hiddenDocument)).toBe(false);
  });

  it('ignores computed-hidden candidates and finds a later visible candidate', () => {
    type FakeElement = Element & {
      computedDisplay?: string;
      computedVisibility?: string;
    };
    const element = (
      computedDisplay = 'block',
      computedVisibility = 'visible',
      parentElement: Element | null = null,
    ) =>
      ({
        parentElement,
        computedDisplay,
        computedVisibility,
        hasAttribute: () => false,
        getAttribute: () => null,
      }) as unknown as FakeElement;
    const hiddenParent = element('none');
    const displayHidden = element('block', 'visible', hiddenParent);
    const visibilityHidden = element('block', 'hidden');
    const visible = element();
    let candidates = [displayHidden, visibilityHidden, visible];
    const computedDocument = {
      querySelectorAll: () => candidates,
      defaultView: {
        getComputedStyle: (candidate: FakeElement) => ({
          display: candidate.computedDisplay,
          visibility: candidate.computedVisibility,
        }),
      },
    } as unknown as Document;

    expect(hasLocalNotificationBlockingSurface(computedDocument)).toBe(true);
    candidates = [displayHidden, visibilityHidden];
    expect(hasLocalNotificationBlockingSurface(computedDocument)).toBe(false);
  });
});
