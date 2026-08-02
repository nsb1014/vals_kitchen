import { beforeEach, describe, expect, it } from 'vitest';
import { createNewGameState } from '../domain/state/game-state.ts';
import { ingredientUnlockCost } from '../domain/economy/costs.ts';
import { useGameStore, getGameStateSnapshot } from '../store/game-store.ts';
import { exportSaveCode, parseSaveCode } from '../persistence/saveCode.ts';
import { testContext } from './test-helpers.ts';
import { selectComposeDraftIds } from '../store/selectors/service-day.ts';

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

describe('phase 6 store integrations', () => {
  beforeEach(() => {
    resetStore(777);
  });

  it('purchase updates cash and unlocks ingredient via PURCHASE', async () => {
    const beforeCash = useGameStore.getState().cash;
    const cost = ingredientUnlockCost(0);
    const target = testContext.ingredients.find(
      (item) =>
        item.equipmentId === 'prep_station' &&
        !item.newGameStarter &&
        !useGameStore.getState().unlockedIngredientIds.includes(item.id),
    );
    expect(target).toBeDefined();

    await useGameStore.getState().dispatch({
      type: 'PURCHASE',
      purchase: { type: 'ingredient', ingredientId: target!.id },
    });

    const after = useGameStore.getState();
    expect(after.cash).toBe(beforeCash - cost);
    expect(after.unlockedIngredientIds).toContain(target!.id);
  });

  it('round-trips save code through store import', async () => {
    useGameStore.setState({ cash: 999, day: 12, prestige: 1 });
    const code = exportSaveCode(getGameStateSnapshot());

    resetStore(1);
    const result = await useGameStore.getState().importSaveCode(code);
    expect(result.ok).toBe(true);
    expect(useGameStore.getState().cash).toBe(999);
    expect(useGameStore.getState().day).toBe(12);
    expect(useGameStore.getState().prestige).toBe(1);
  });

  it('rejects corrupt save codes through import', async () => {
    const result = await useGameStore.getState().importSaveCode('RS1.not-valid-data');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('opens flavor inspector during compose without losing draft', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    useGameStore.getState().dismissModifier();

    const draft = ['flour', 'salt', 'butter'];
    const activeDay = useGameStore.getState().activeDay!;
    const customer = activeDay.customers[0]!;
    const ticketId = `ticket_${customer.id}`;
    useGameStore.setState({
      activeDay: {
        ...activeDay,
        floor: {
          ...activeDay.floor!,
          tickets: [
            {
              id: ticketId,
              customerId: customer.id,
              ingredientIds: [],
              status: 'open',
            },
          ],
          selectedTicketId: ticketId,
        },
      },
    });
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TICKET_DRAFT',
      ticketId,
      ingredientIds: draft,
    });

    useGameStore.getState().openFlavorInspector('flour');
    expect(useGameStore.getState().flavorInspectorIngredientId).toBe('flour');
    expect(selectComposeDraftIds(useGameStore.getState())).toEqual(draft);

    useGameStore.getState().closeFlavorInspector();
    expect(useGameStore.getState().flavorInspectorIngredientId).toBeNull();
    expect(selectComposeDraftIds(useGameStore.getState())).toEqual(draft);
  });

  it('blocks navigation away from restaurant during active day', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    useGameStore.getState().navigateTo('shop');
    expect(useGameStore.getState().screen).toBe('restaurant');
  });
});

describe('save code parse parity', () => {
  it('imported code matches parseSaveCode', () => {
    const original = createNewGameState(555);
    original.discoveredRecipeIds = ['abc'];
    const code = exportSaveCode(original);
    expect(parseSaveCode(code).discoveredRecipeIds).toEqual(['abc']);
  });
});
