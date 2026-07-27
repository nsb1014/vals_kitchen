import { describe, expect, it } from 'vitest';
import {
  navigationLockReason,
  shouldShowNavigationLockHint,
} from '../../store/selectors/navigation.ts';
import type { GameStore } from '../../store/game-store.ts';

function stubStore(overrides: Partial<GameStore>): GameStore {
  return {
    screen: 'restaurant',
    activeDay: null,
    daySummary: null,
    ...overrides,
  } as GameStore;
}

const activeDayStub = { day: 1 } as unknown as GameStore['activeDay'];
const daySummaryStub = { day: 1 } as unknown as GameStore['daySummary'];

describe('navigation lock hint', () => {
  it('exposes the leave-restaurant lock copy while a service day is active', () => {
    const state = stubStore({ activeDay: activeDayStub });
    expect(navigationLockReason(state)).toBe(
      'Finish or close the service day before leaving the restaurant.',
    );
  });

  it('does not pin the lock hint while the bottom nav is hidden mid-service', () => {
    const state = stubStore({
      screen: 'restaurant',
      activeDay: activeDayStub,
      daySummary: null,
    });
    expect(shouldShowNavigationLockHint(state)).toBe(false);
  });

  it('shows the lock hint when nav is available but other tabs are blocked', () => {
    const state = stubStore({
      screen: 'restaurant',
      activeDay: activeDayStub,
      daySummary: daySummaryStub,
    });
    expect(shouldShowNavigationLockHint(state)).toBe(true);
  });

  it('hides the lock hint when there is no active day', () => {
    expect(shouldShowNavigationLockHint(stubStore({ activeDay: null }))).toBe(false);
  });
});
