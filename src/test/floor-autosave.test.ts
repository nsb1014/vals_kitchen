import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalize } from '../persistence/serialize.ts';
import { createSaveRepository, type StorageAdapter } from '../persistence/SaveRepository.ts';
import { createNewGameState } from '../domain/state/game-state.ts';
import { getGameStateSnapshot, useGameStore } from '../store/game-store.ts';
import './test-helpers.ts';

function createMemoryStorage(): StorageAdapter {
  const map = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => map.get(key) as T | undefined,
    set: async (key: string, value: unknown) => {
      map.set(key, value);
    },
    del: async (key: string) => {
      map.delete(key);
    },
  };
}

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
    floorPlayerGrid: null,
    floorToast: null,
  });
}

function applyHydratedState(loaded: ReturnType<typeof createNewGameState>): void {
  useGameStore.setState({
    ...loaded,
    screen: 'restaurant',
    editLayoutMode: false,
    hydrated: true,
    persistGranted: false,
    modifierDismissed: true,
    pendingReview: null,
    daySummary: null,
    ceremony: null,
    ceremonyPrestige: null,
    dayStartRating: loaded.rating,
    recentReviews: [],
    flavorInspectorIngredientId: null,
    pendingPlacementItemKey: null,
    audioEnabled: true,
    musicEnabled: false,
    floorPlayerGrid: loaded.activeDay?.floor?.playerPosition ?? null,
    floorToast: null,
  });
}

async function advanceFloorToCarryTicket(): Promise<{
  ticketId: string;
  floorBeforeSave: NonNullable<ReturnType<typeof getGameStateSnapshot>['activeDay']>['floor'];
}> {
  await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
  useGameStore.getState().dismissModifier();

  const floor = useGameStore.getState().activeDay!.floor!;
  for (const table of floor.tables) {
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TABLE',
      placementId: table.placementId,
    });
  }
  await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });

  const seated = useGameStore.getState().activeDay!.floor!.pool.find((g) => g.stage === 'seated')!;
  await useGameStore.getState().dispatch({
    type: 'FLOOR_TAKE_ORDERS',
    customerIds: [seated.customer.id],
  });

  const ticket = useGameStore.getState().activeDay!.floor!.tickets[0]!;
  const ingredientIds = useGameStore.getState().unlockedIngredientIds.slice(0, 3);
  await useGameStore.getState().dispatch({
    type: 'FLOOR_PLATE',
    ticketId: ticket.id,
    ingredientIds,
  });

  const floorBeforeSave = useGameStore.getState().activeDay!.floor!;
  expect(floorBeforeSave.carriedTicketId).toBe(ticket.id);
  return { ticketId: ticket.id, floorBeforeSave };
}

describe('floor autosave via store dispatch', () => {
  beforeEach(() => {
    resetStore(7777);
  });

  it('autosaves floor tickets and carry state through save/load resume', async () => {
    const autosaveSpy = vi.spyOn(useGameStore.getState(), 'autosave').mockResolvedValue(undefined);

    const { ticketId, floorBeforeSave } = await advanceFloorToCarryTicket();
    expect(autosaveSpy).toHaveBeenCalled();

    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    await repo.save(getGameStateSnapshot());

    resetStore(1);
    const loaded = (await repo.load()).state!;
    applyHydratedState(loaded);

    const resumed = useGameStore.getState();
    const floor = resumed.activeDay?.floor;
    expect(floor).toBeTruthy();
    expect(floor!.carriedTicketId).toBe(ticketId);
    expect(floor!.tickets).toEqual(floorBeforeSave.tickets);
    expect(floor!.pool.map((g) => ({ id: g.customer.id, stage: g.stage }))).toEqual(
      floorBeforeSave.pool.map((g) => ({ id: g.customer.id, stage: g.stage })),
    );
    expect(floor!.playerPosition).toEqual(floorBeforeSave.playerPosition);
    expect(resumed.floorPlayerGrid).toEqual(floorBeforeSave.playerPosition);
    expect(canonicalize(floor)).toBe(canonicalize(floorBeforeSave));
  });

  it('dismisses pending review without touching floor state', async () => {
    await advanceFloorToCarryTicket();
    useGameStore.setState({
      pendingReview: {
        matchStars: 3,
        tip: 5,
        ratingDelta: 0.1,
        recipeName: 'Test Dish',
      },
    });

    useGameStore.getState().dismissPendingReview();

    expect(useGameStore.getState().pendingReview).toBeNull();
    expect(useGameStore.getState().activeDay?.floor?.carriedTicketId).not.toBeNull();
  });
});
