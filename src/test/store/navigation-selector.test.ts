import { describe, expect, it } from 'vitest';
import type { GameStore } from '../../store/game-store.ts';
import { shouldShowNavigationLockHint } from '../../store/selectors/navigation.ts';

const activeDay = { day: 1 } as unknown as GameStore['activeDay'];
const daySummary = { day: 1 } as unknown as GameStore['daySummary'];

function state(overrides: Partial<GameStore>): GameStore {
  return {
    screen: 'restaurant',
    activeDay,
    daySummary: null,
    ...overrides,
  } as GameStore;
}

describe('navigation hint selector', () => {
  it('does not persist over Settings during an active service', () => {
    expect(shouldShowNavigationLockHint(state({ screen: 'settings' }))).toBe(
      false,
    );
  });

  it('retains the summary navigation hint on the restaurant screen', () => {
    expect(
      shouldShowNavigationLockHint(state({ screen: 'restaurant', daySummary })),
    ).toBe(true);
  });
});
