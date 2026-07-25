import { beforeEach, describe, expect, it } from 'vitest';
import { findBestMatchCombo } from '../domain/day/customer-request-generator.ts';
import { isDayComplete } from '../domain/day/serve.ts';
import { customersPerDay } from '../domain/day/types.ts';
import { createNewGameState } from '../domain/state/game-state.ts';
import { useGameStore } from '../store/game-store.ts';
import { mapReducerEventsToUi } from '../store/service-events.ts';
import { testContext } from './test-helpers.ts';

function resetStore(seed: number): void {
  useGameStore.setState({
    ...createNewGameState(seed),
    screen: 'restaurant',
    editLayoutMode: true,
    hydrated: true,
    persistGranted: false,
    modifierDismissed: false,
    pendingReview: null,
    daySummary: null,
    ceremony: null,
    ceremonyPrestige: null,
    dayStartRating: null,
    recentReviews: [],
    flavorInspectorIngredientId: null,
    pendingPlacementItemKey: null,
    audioEnabled: true,
    musicEnabled: false,
  });
}

async function serveCurrentCustomer(): Promise<void> {
  const state = useGameStore.getState();
  if (!state.activeDay) throw new Error('No active day');
  const customer = state.activeDay.customers[state.activeDay.queueIndex]!;
  const best = findBestMatchCombo(
    state.unlockedIngredientIds,
    customer.preference,
    testContext.ingredientsById,
    testContext.compoundAffinity,
  );
  await useGameStore.getState().dispatch({ type: 'SERVE_DISH', ingredientIds: best.ingredientIds });
}

describe('service day store flow', () => {
  beforeEach(() => {
    resetStore(424242);
  });

  it('opens day, serves all customers, closes with summary', async () => {
    const before = useGameStore.getState();
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });

    let state = useGameStore.getState();
    expect(state.activeDay).not.toBeNull();
    expect(state.editLayoutMode).toBe(false);
    expect(state.activeDay!.customers.length).toBe(
      customersPerDay({
        seatingCapacity: before.seatingCapacity,
        rating: before.rating,
        prestige: before.prestige,
        day: before.day,
      }),
    );

    useGameStore.getState().dismissModifier();

    while (!isDayComplete(useGameStore.getState())) {
      await serveCurrentCustomer();
      state = useGameStore.getState();
      expect(state.pendingReview).not.toBeNull();
      if (isDayComplete(state)) break;
      await useGameStore.getState().dispatch({ type: 'NEXT_CUSTOMER' });
    }

    const cashBeforeClose = useGameStore.getState().cash;
    await useGameStore.getState().dispatch({ type: 'CLOSE_DAY' });
    state = useGameStore.getState();

    expect(state.activeDay).toBeNull();
    expect(state.daySummary).not.toBeNull();
    expect(state.day).toBe(before.day + 1);
    expect(state.cash).toBeGreaterThanOrEqual(cashBeforeClose);
    expect(state.daySummary!.customersServedText).toMatch(/Customers served: \d+/);
  });

  it('maps prestige and soft-reset reducer events to ceremony state', () => {
    const before = createNewGameState(1);
    expect(mapReducerEventsToUi([{ type: 'PRESTIGE_TRIGGERED', prestige: 3 }], before)).toEqual({
      ceremony: 'prestige',
      ceremonyPrestige: 3,
    });
    expect(mapReducerEventsToUi([{ type: 'SOFT_RESET_TRIGGERED' }], before)).toEqual({
      ceremony: 'soft_reset',
      ceremonyPrestige: null,
    });
  });

  it('surfaces prestige ceremony when rating reaches 6', async () => {
    resetStore(777001);
    useGameStore.setState({ rating: 5.95 });
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    useGameStore.getState().dismissModifier();

    await serveCurrentCustomer();
    const state = useGameStore.getState();
    expect(state.ceremony).toBe('prestige');
    expect(state.prestige).toBeGreaterThan(0);
    expect(state.rating).toBe(3);
  });

});
