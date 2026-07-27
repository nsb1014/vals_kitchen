import { describe, expect, it } from 'vitest';
import {
  selectShowOpenForService,
  selectShowServiceDayOverlay,
} from '../../store/selectors/service-day.ts';
import type { GameStore } from '../../store/game-store.ts';

function stub(overrides: Partial<GameStore> = {}): GameStore {
  return {
    screen: 'restaurant',
    activeDay: null,
    daySummary: null,
    editLayoutMode: false,
    ...overrides,
  } as GameStore;
}

describe('open-for-service screen gating', () => {
  it('shows the open-for-service prompt only on the restaurant floor', () => {
    expect(selectShowOpenForService(stub({ screen: 'restaurant' }))).toBe(true);
    expect(selectShowOpenForService(stub({ screen: 'inspector' }))).toBe(false);
    expect(selectShowOpenForService(stub({ screen: 'shop' }))).toBe(false);
    expect(selectShowOpenForService(stub({ screen: 'recipes' }))).toBe(false);
  });

  it('hides open-for-service while editing layout or after the day starts', () => {
    expect(selectShowOpenForService(stub({ editLayoutMode: true }))).toBe(false);
    expect(
      selectShowOpenForService(
        stub({ activeDay: { day: 1 } as unknown as GameStore['activeDay'] }),
      ),
    ).toBe(false);
    expect(
      selectShowOpenForService(
        stub({ daySummary: { day: 1 } as unknown as GameStore['daySummary'] }),
      ),
    ).toBe(false);
  });

  it('keeps all service-day overlays off non-restaurant screens', () => {
    expect(selectShowServiceDayOverlay(stub({ screen: 'restaurant' }))).toBe(true);
    expect(selectShowServiceDayOverlay(stub({ screen: 'inspector' }))).toBe(false);
    expect(selectShowServiceDayOverlay(stub({ screen: 'settings' }))).toBe(false);
  });
});
