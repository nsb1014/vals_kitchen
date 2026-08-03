import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import { findBestMatchCombo } from '../domain/day/customer-request-generator.ts';
import { gameReducer } from '../domain/reducer.ts';
import {
  createNewGameState,
  normalizeGameState,
  type GameState,
} from '../domain/state/game-state.ts';
import { createSaveRepository, type StorageAdapter } from '../persistence/SaveRepository.ts';
import {
  exportSaveCode,
  exportSaveCodeSnapshot,
  migrateSave,
  parseSaveCode,
} from '../persistence/saveCode.ts';
import {
  SAVE_CODE_PREFIX,
  SAVE_KEY,
  computeChecksum,
} from '../persistence/serialize.ts';
import {
  getGameStateSnapshot,
  setGameSaveRepositoryForTests,
  useGameStore,
} from '../store/game-store.ts';
import { selectFloorRuntimeRunning } from '../store/selectors/floor-runtime.ts';
import type { PresentationCheckpoint } from '../persistence/presentation-checkpoint.ts';
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

function mandatoryReviewCheckpoint(state: GameState): PresentationCheckpoint {
  const customerId = state.activeDay?.customers[0]?.id;
  if (!customerId) throw new Error('Expected active customer');
  return {
    pendingReview: {
      customerId,
      matchStars: 8.4,
      tip: 19,
      ratingDelta: 0.16,
      recipeName: 'Resume Plate',
      masteryLine: 'Mastery Lv.2 (+0.10★)',
    },
    daySummary: null,
    ceremony: null,
    ceremonyPrestige: null,
    dayStartRating: 3,
    recentReviews: [
      {
        matchStars: 8.4,
        ratingDelta: 0.16,
        tip: 19,
        recipeName: 'Resume Plate',
        day: state.day,
      },
    ],
  };
}

function encodeLegacyV6SaveCode(state: GameState): string {
  const legacyState = { ...structuredClone(state), saveVersion: 6 };
  const envelope = {
    saveVersion: 6,
    checksum: computeChecksum(legacyState as unknown as GameState),
    createdAt: '2026-08-01T00:00:00.000Z',
    gameState: legacyState,
  };
  const bytes = LZString.compressToUint8Array(JSON.stringify(envelope));
  return `${SAVE_CODE_PREFIX}.${Buffer.from(bytes).toString('base64url')}`;
}

describe('service day mid-day resume', () => {
  beforeEach(() => {
    setGameSaveRepositoryForTests(null);
    resetStore(9090);
  });

  afterEach(() => {
    setGameSaveRepositoryForTests(null);
  });

  it('hydrates a mandatory review checkpoint and keeps floor runtime blocked', async () => {
    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    let state = gameReducer(
      createNewGameState(90_901),
      { type: 'OPEN_DAY' },
      testContext,
    ).state;
    state = gameReducer(state, { type: 'START_SERVICE' }, testContext).state;
    const presentation = mandatoryReviewCheckpoint(state);
    await repo.save(state, presentation);

    resetStore(1);
    setGameSaveRepositoryForTests(repo);
    await useGameStore.getState().hydrate();

    const resumed = useGameStore.getState();
    expect(resumed.pendingReview).toEqual(presentation.pendingReview);
    expect(resumed.dayStartRating).toBe(3);
    expect(resumed.recentReviews).toEqual(presentation.recentReviews);
    expect(resumed.modifierDismissed).toBe(true);
    expect(selectFloorRuntimeRunning(resumed, true)).toBe(false);
  });

  it('imports a mandatory review checkpoint and keeps floor runtime blocked', async () => {
    let state = gameReducer(
      createNewGameState(90_902),
      { type: 'OPEN_DAY' },
      testContext,
    ).state;
    state = gameReducer(state, { type: 'START_SERVICE' }, testContext).state;
    const presentation = mandatoryReviewCheckpoint(state);
    const code = exportSaveCodeSnapshot({ state, presentation });

    resetStore(2);
    expect(await useGameStore.getState().importSaveCode(code)).toEqual({ ok: true });

    const imported = useGameStore.getState();
    expect(imported.pendingReview).toEqual(presentation.pendingReview);
    expect(imported.dayStartRating).toBe(presentation.dayStartRating);
    expect(imported.recentReviews).toEqual(presentation.recentReviews);
    expect(imported.modifierDismissed).toBe(true);
    expect(selectFloorRuntimeRunning(imported, true)).toBe(false);
  });

  it.each(['repository', 'save-code'] as const)(
    'recovers the original day-start rating from a mid-day v6 %s',
    async (source) => {
      let legacy = gameReducer(
        createNewGameState(90_903),
        { type: 'OPEN_DAY' },
        testContext,
      ).state;
      legacy = {
        ...legacy,
        rating: 3.35,
        activeDay: {
          ...legacy.activeDay!,
          floor: null,
          serviceStarted: true,
          customersServed: legacy.activeDay!.customers.length,
          queueIndex: legacy.activeDay!.customers.length - 1,
          dayMatchSum: legacy.activeDay!.customers.length * 8,
          dayRatingDelta: 0.35,
          ratingResetOccurred: false,
        },
      };

      resetStore(3);
      if (source === 'repository') {
        const storage = createMemoryStorage();
        const legacyState = { ...structuredClone(legacy), saveVersion: 6 };
        await storage.set(SAVE_KEY, {
          saveVersion: 6,
          checksum: computeChecksum(legacyState as unknown as GameState),
          createdAt: '2026-08-01T00:00:00.000Z',
          gameState: legacyState,
        });
        setGameSaveRepositoryForTests(createSaveRepository(storage));
        await useGameStore.getState().hydrate();
      } else {
        expect(
          await useGameStore
            .getState()
            .importSaveCode(encodeLegacyV6SaveCode(legacy)),
        ).toEqual({ ok: true });
      }

      expect(useGameStore.getState().dayStartRating).toBeCloseTo(3, 8);
      await useGameStore.getState().dispatch({ type: 'CLOSE_DAY' });
      expect(useGameStore.getState().daySummary?.ratingDeltaText).toContain(
        '(3.0 → 3.4)',
      );
    },
  );

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

describe('persisted service start', () => {
  it('rejects starting service without an active floor day', () => {
    expect(() =>
      gameReducer(createNewGameState(7101), { type: 'START_SERVICE' }, testContext),
    ).toThrow('No active floor day');

    const withoutFloor = gameReducer(
      createNewGameState(7102),
      { type: 'OPEN_DAY' },
      testContext,
    ).state;
    withoutFloor.activeDay = { ...withoutFloor.activeDay!, floor: null };
    expect(() =>
      gameReducer(withoutFloor, { type: 'START_SERVICE' }, testContext),
    ).toThrow('No active floor day');
  });

  it('starts service once and returns the exact state when already started', () => {
    const opened = gameReducer(
      createNewGameState(7103),
      { type: 'OPEN_DAY' },
      testContext,
    ).state;
    expect(opened.activeDay?.serviceStarted).toBe(false);

    const started = gameReducer(opened, { type: 'START_SERVICE' }, testContext);
    expect(started.state).not.toBe(opened);
    expect(started.state.activeDay?.serviceStarted).toBe(true);
    expect(started.events).toEqual([]);

    const repeated = gameReducer(
      started.state,
      { type: 'START_SERVICE' },
      testContext,
    );
    expect(repeated.state).toBe(started.state);
    expect(repeated.events).toEqual([]);
  });

  it.each([
    { label: 'a missing flag', serviceStarted: undefined, expected: true },
    { label: 'an explicit false flag', serviceStarted: false, expected: false },
  ])('migrates v5 active days with $label', ({ serviceStarted, expected }) => {
    const state = gameReducer(
      createNewGameState(7104),
      { type: 'OPEN_DAY' },
      testContext,
    ).state;
    const activeDay = { ...state.activeDay } as Record<string, unknown>;
    if (serviceStarted === undefined) {
      delete activeDay.serviceStarted;
    } else {
      activeDay.serviceStarted = serviceStarted;
    }
    const legacyState = {
      ...state,
      saveVersion: 5,
      activeDay,
    };
    const envelope = {
      saveVersion: 5,
      checksum: computeChecksum(legacyState as unknown as GameState),
      createdAt: '2026-08-02T00:00:00.000Z',
      gameState: legacyState,
    };

    expect(migrateSave(envelope).gameState.activeDay?.serviceStarted).toBe(expected);
  });

  it('defensively normalizes a current save while preserving explicit false', () => {
    const opened = gameReducer(
      createNewGameState(7105),
      { type: 'OPEN_DAY' },
      testContext,
    ).state;
    expect(
      normalizeGameState({
        ...opened,
        activeDay: { ...opened.activeDay!, serviceStarted: false },
      }).activeDay?.serviceStarted,
    ).toBe(false);

    const malformed = structuredClone(opened) as unknown as {
      activeDay: Record<string, unknown>;
    };
    delete malformed.activeDay.serviceStarted;
    expect(
      normalizeGameState(malformed as unknown as typeof opened).activeDay?.serviceStarted,
    ).toBe(true);
  });

  it.each([false, true])(
    'round-trips serviceStarted=%s through a Save Code',
    (serviceStarted) => {
      let state = gameReducer(
        createNewGameState(serviceStarted ? 7106 : 7107),
        { type: 'OPEN_DAY' },
        testContext,
      ).state;
      if (serviceStarted) {
        state = gameReducer(state, { type: 'START_SERVICE' }, testContext).state;
      }

      const imported = parseSaveCode(
        exportSaveCode(state, '2026-08-02T00:00:00.000Z'),
      );
      expect(imported.activeDay?.serviceStarted).toBe(serviceStarted);
    },
  );
});
