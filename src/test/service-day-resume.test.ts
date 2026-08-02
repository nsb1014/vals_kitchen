import { beforeEach, describe, expect, it } from 'vitest';
import { findBestMatchCombo } from '../domain/day/customer-request-generator.ts';
import { gameReducer } from '../domain/reducer.ts';
import { createNewGameState, normalizeGameState } from '../domain/state/game-state.ts';
import { createSaveRepository, type StorageAdapter } from '../persistence/SaveRepository.ts';
import { getGameStateSnapshot, useGameStore } from '../store/game-store.ts';
import { testContext } from './test-helpers.ts';

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
  });
}

describe('service day mid-day resume', () => {
  beforeEach(() => {
    resetStore(9090);
  });

  it('restores each floor ticket draft after reload', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    useGameStore.getState().dismissModifier();

    const opened = useGameStore.getState();
    const customer = opened.activeDay!.customers[opened.activeDay!.queueIndex]!;
    const best = findBestMatchCombo(
      opened.unlockedIngredientIds,
      customer.preference,
      testContext.ingredientsById,
      testContext.compoundAffinity,
    );
    const draftIds = best.ingredientIds.slice(0, 3);
    const ticketId = `ticket_${customer.id}`;
    useGameStore.setState({
      activeDay: {
        ...opened.activeDay!,
        floor: {
          ...opened.activeDay!.floor!,
          tickets: [
            { id: ticketId, customerId: customer.id, ingredientIds: [], status: 'open' },
          ],
          selectedTicketId: ticketId,
        },
      },
    });
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TICKET_DRAFT',
      ticketId,
      ingredientIds: draftIds,
    });

    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    await repo.save(getGameStateSnapshot());

    resetStore(1);
    const loaded = (await repo.load()).state!;
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
    });

    const resumed = useGameStore.getState();
    expect(resumed.activeDay?.seed).toBe(opened.activeDay?.seed);
    expect(resumed.activeDay?.queueIndex).toBe(0);
    expect(
      resumed.activeDay?.floor?.tickets.find((ticket) => ticket.id === ticketId)
        ?.ingredientIds,
    ).toEqual(draftIds);
    expect(resumed.composeDraftIngredientIds).toBeUndefined();
    expect(resumed.activeDay?.customers[0]?.preference.phrases).toEqual(
      customer.preference.phrases,
    );

  });

  it('preserves reducer-only compose drafts for legacy non-floor service', () => {
    let state = gameReducer(createNewGameState(9090), { type: 'OPEN_DAY' }, testContext).state;
    state.activeDay = { ...state.activeDay!, floor: null };
    const customer = state.activeDay!.customers[0]!;
    const best = findBestMatchCombo(
      state.unlockedIngredientIds,
      customer.preference,
      testContext.ingredientsById,
      testContext.compoundAffinity,
    );
    const draftIds = best.ingredientIds.slice(0, 3);
    state = gameReducer(state, { type: 'SET_COMPOSE_DRAFT', ingredientIds: draftIds }, testContext).state;
    const resumed = gameReducer(state, { type: 'SERVE_DISH', ingredientIds: draftIds }, testContext).state;
    expect(resumed.activeDay?.customersServed).toBe(1);
    expect(resumed.composeDraftIngredientIds).toBeUndefined();
  });

  it('migrates a legacy global draft once to the selected open floor ticket', () => {
    let legacy = gameReducer(createNewGameState(5150), { type: 'OPEN_DAY' }, testContext).state;
    const unlocked = legacy.unlockedIngredientIds;
    const customerId = legacy.activeDay!.customers[0]!.id;
    legacy.activeDay = {
      ...legacy.activeDay!,
      floor: {
        ...legacy.activeDay!.floor!,
        tickets: [
          { id: 'a', customerId, ingredientIds: ['existing'], status: 'open' },
          { id: 'b', customerId, ingredientIds: [], status: 'open' },
        ],
        selectedTicketId: 'b',
      },
    };
    legacy.composeDraftIngredientIds = [
      unlocked[0]!,
      unlocked[1]!,
      unlocked[0]!,
      'unknown',
      ...unlocked.slice(2, 8),
    ];

    const migrated = normalizeGameState(legacy);
    expect(migrated.composeDraftIngredientIds).toBeUndefined();
    expect(migrated.activeDay!.floor!.tickets.find((ticket) => ticket.id === 'a')?.ingredientIds)
      .toEqual(['existing']);
    expect(migrated.activeDay!.floor!.tickets.find((ticket) => ticket.id === 'b')?.ingredientIds)
      .toEqual(unlocked.slice(0, 6));
    expect(normalizeGameState(migrated).activeDay!.floor!.tickets).toEqual(
      migrated.activeDay!.floor!.tickets,
    );
  });

  it('falls back to the first open ticket when a legacy selection is stale', () => {
    const legacy = gameReducer(createNewGameState(6160), { type: 'OPEN_DAY' }, testContext).state;
    const customerId = legacy.activeDay!.customers[0]!.id;
    legacy.activeDay = {
      ...legacy.activeDay!,
      floor: {
        ...legacy.activeDay!.floor!,
        tickets: [
          { id: 'first', customerId, ingredientIds: [], status: 'open' },
          { id: 'second', customerId, ingredientIds: [], status: 'open' },
        ],
        selectedTicketId: 'stale',
      },
    };
    legacy.composeDraftIngredientIds = legacy.unlockedIngredientIds.slice(0, 3);

    const migrated = normalizeGameState(legacy);
    expect(migrated.activeDay!.floor!.selectedTicketId).toBe('first');
    expect(migrated.activeDay!.floor!.tickets[0]!.ingredientIds).toEqual(
      legacy.unlockedIngredientIds.slice(0, 3),
    );
    expect(migrated.activeDay!.floor!.tickets[1]!.ingredientIds).toEqual([]);

    legacy.activeDay = {
      ...legacy.activeDay!,
      floor: {
        ...legacy.activeDay!.floor!,
        tickets: [
          { id: 'carried', customerId, ingredientIds: [], status: 'plated' },
          { id: 'open', customerId, ingredientIds: [], status: 'open' },
        ],
        carriedTicketId: 'carried',
        selectedTicketId: 'open',
      },
    };
    legacy.composeDraftIngredientIds = undefined;
    expect(normalizeGameState(legacy).activeDay!.floor!.selectedTicketId).toBeNull();
  });
});
