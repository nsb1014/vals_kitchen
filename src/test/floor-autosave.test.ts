import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalize, SAVE_KEY } from '../persistence/serialize.ts';
import { exportSaveCode, parseSaveCode } from '../persistence/saveCode.ts';
import { createSaveRepository, type StorageAdapter } from '../persistence/SaveRepository.ts';
import { connectingDoorInterior } from '../domain/floor/starter-map.ts';
import { waitingGuestServicePositions } from '../domain/floor/interact.ts';
import { scoreDishForCustomer } from '../domain/day/serve.ts';
import { createNewGameState } from '../domain/state/game-state.ts';
import {
  getGameStateSnapshot,
  setGameSaveRepositoryForTests,
  useGameStore,
} from '../store/game-store.ts';
import { testContext } from './test-helpers.ts';

const storeAutosave = useGameStore.getState().autosave;

function movePlayerToWaitingGuest(): void {
  const state = useGameStore.getState();
  const position = waitingGuestServicePositions(
    state.gridSize.w,
    state.gridSize.h,
  )[0]!;
  useGameStore.getState().setFloorNavPosition(position);
}

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

function createControlledStorage(): {
  storage: StorageAdapter;
  deferNextPrimaryWrite: () => {
    release: () => void;
    fail: (error: Error) => void;
    waitUntilStarted: () => Promise<void>;
  };
} {
  const map = new Map<string, unknown>();
  const writeGates: Array<{
    promise: Promise<void>;
    markStarted: () => void;
  }> = [];

  return {
    storage: {
      get: async <T>(key: string) => map.get(key) as T | undefined,
      set: async (key: string, value: unknown) => {
        if (key === SAVE_KEY) {
          const gate = writeGates.shift();
          if (gate) {
            gate.markStarted();
            await gate.promise;
          }
        }
        map.set(key, value);
      },
      del: async (key: string) => {
        map.delete(key);
      },
    },
    deferNextPrimaryWrite() {
      let release!: () => void;
      let fail!: (error: Error) => void;
      let markStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const promise = new Promise<void>((resolve, reject) => {
          release = resolve;
          fail = reject;
        });
      writeGates.push({ promise, markStarted });
      return { release, fail, waitUntilStarted: () => started };
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
    serviceStartPending: false,
    serviceStartError: null,
    pendingReview: null,
    daySummary: null,
    ceremony: null,
    ceremonyPrestige: null,
    dayStartRating: null,
    recentReviews: [],
    presentationSavePending: false,
    presentationSaveError: null,
    flavorInspectorIngredientId: null,
    pendingPlacementItemKey: null,
    audioEnabled: true,
    musicEnabled: false,
    floorPlayerGrid: null,
    floorToast: null,
    autosave: storeAutosave,
  });
}

function applyHydratedState(loaded: ReturnType<typeof createNewGameState>): void {
  useGameStore.setState({
    ...loaded,
    screen: 'restaurant',
    editLayoutMode: false,
    activeFloorRoom: loaded.activeDay?.floor?.playerRoom ?? 'main',
    hydrated: true,
    persistGranted: false,
    modifierDismissed: loaded.activeDay?.serviceStarted ?? false,
    serviceStartPending: false,
    serviceStartError: null,
    pendingReview: null,
    daySummary: null,
    ceremony: null,
    ceremonyPrestige: null,
    dayStartRating: loaded.rating,
    recentReviews: [],
    presentationSavePending: false,
    presentationSaveError: null,
    flavorInspectorIngredientId: null,
    pendingPlacementItemKey: null,
    audioEnabled: true,
    musicEnabled: false,
    floorPlayerGrid: loaded.activeDay?.floor?.playerPosition ?? null,
    floorToast: null,
  });
}

function worstDishForCurrentCustomer(): string[] {
  const state = useGameStore.getState();
  const customer = state.activeDay!.customers[state.activeDay!.queueIndex]!;
  const ids = state.unlockedIngredientIds;
  let worst: { ids: string[]; matchStars: number } | null = null;
  for (let first = 0; first < ids.length - 2; first += 1) {
    for (let second = first + 1; second < ids.length - 1; second += 1) {
      for (let third = second + 1; third < ids.length; third += 1) {
        const ingredientIds = [ids[first]!, ids[second]!, ids[third]!];
        const score = scoreDishForCustomer(
          state,
          customer,
          ingredientIds,
          testContext,
        );
        if (!worst || score.matchStars < worst.matchStars) {
          worst = { ids: ingredientIds, matchStars: score.matchStars };
        }
      }
    }
  }
  if (!worst || worst.matchStars >= 5) {
    throw new Error('Expected a below-neutral dish for the soft-reset fixture');
  }
  return worst.ids;
}

async function configurePresentationCheckpoint(
  kind: 'review' | 'ceremony' | 'summary',
): Promise<void> {
  if (kind === 'review') {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    const customerId = useGameStore.getState().activeDay!.customers[0]!.id;
    useGameStore.setState({
      pendingReview: {
        customerId,
        matchStars: 8,
        tip: 12,
        ratingDelta: 0.1,
        recipeName: 'Retry Plate',
      },
      dayStartRating: 3,
    });
    return;
  }
  if (kind === 'ceremony') {
    useGameStore.setState({
      ...createNewGameState(8_082),
      pendingReview: null,
      ceremony: 'soft_reset',
      ceremonyPrestige: null,
      dayStartRating: null,
    });
    return;
  }
  const closed = createNewGameState(8_083);
  closed.day = 2;
  useGameStore.setState({
    ...closed,
    pendingReview: null,
    ceremony: null,
    ceremonyPrestige: null,
    dayStartRating: null,
    daySummary: {
      completedDay: 1,
      nextDay: 2,
      earningsLine: "Today's earnings: $50",
      bonusLine: null,
      volumeBonusLine: null,
      averageMatchText: 'Average match: 7.0 / 10',
      ratingDeltaText: 'Rating change: +0.10★ (3.0 → 3.1)',
      unlockProgressText: 'Ingredients unlocked: 13 / 40',
      customersServedText: 'Customers served: 4',
      masteryLine: null,
    },
  });
}

async function advanceFloorToOpenTicket(): Promise<string> {
  await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
  await useGameStore.getState().dismissModifier();

  const floor = useGameStore.getState().activeDay!.floor!;
  for (const table of floor.tables) {
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TABLE',
      placementId: table.placementId,
    });
  }
  await useGameStore.getState().dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
  movePlayerToWaitingGuest();
  await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });

  const seating = useGameStore.getState().activeDay!.floor!.pool.find((g) => g.stage === 'seating')!;
  await useGameStore.getState().dispatch({
    type: 'FLOOR_COMPLETE_SEATING',
    guestId: seating.id,
  });

  const seated = useGameStore.getState().activeDay!.floor!.pool.find((g) => g.stage === 'seated')!;
  useGameStore.getState().setFloorNavPosition({
    x: seated.seat!.x,
    y: seated.seat!.y + 2,
  });
  await useGameStore.getState().dispatch({
    type: 'FLOOR_TAKE_ORDERS',
    customerIds: [seated.customer.id],
  });

  const ticket = useGameStore.getState().activeDay!.floor!.tickets[0]!;
  const station = useGameStore
    .getState()
    .placements.find((placement) => placement.itemKey === 'prep_station')!;
  useGameStore
    .getState()
    .setFloorNavPosition({ x: station.x - 1, y: station.y });
  return ticket.id;
}

async function advanceFloorToCarryTicket(): Promise<{
  ticketId: string;
  floorBeforeSave: NonNullable<NonNullable<ReturnType<typeof getGameStateSnapshot>['activeDay']>['floor']>;
}> {
  const ticketId = await advanceFloorToOpenTicket();
  const ingredientIds = useGameStore.getState().unlockedIngredientIds.slice(0, 3);
  await useGameStore.getState().dispatch({
    type: 'FLOOR_SET_TICKET_DRAFT',
    ticketId,
    ingredientIds,
  });
  await useGameStore.getState().dispatch({ type: 'FLOOR_PLATE', ticketId });

  const floorBeforeSave = useGameStore.getState().activeDay!.floor!;
  expect(floorBeforeSave.carriedTicketId).toBe(ticketId);
  return { ticketId, floorBeforeSave };
}

describe('floor autosave via store dispatch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setGameSaveRepositoryForTests(null);
    resetStore(7777);
  });

  afterEach(() => {
    setGameSaveRepositoryForTests(null);
  });

  it('autosaves discrete movement and validated ticket selection for reload', async () => {
    const ticketId = await advanceFloorToOpenTicket();
    const autosaveSpy = vi
      .spyOn(useGameStore.getState(), 'autosave')
      .mockResolvedValue(undefined);

    useGameStore.getState().setFloorSelectedTicket(null);
    useGameStore.getState().setFloorSelectedTicket(ticketId);
    useGameStore.getState().setFloorNavPosition({ x: 2, y: 5 });

    expect(autosaveSpy).toHaveBeenCalledTimes(3);
    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    await repo.save(getGameStateSnapshot());
    resetStore(1);
    applyHydratedState((await repo.load()).state!);

    expect(useGameStore.getState().activeDay!.floor!.selectedTicketId).toBe(
      ticketId,
    );
    expect(useGameStore.getState().activeDay!.floor!.playerPosition).toEqual({
      x: 2,
      y: 5,
    });
    expect(useGameStore.getState().floorPlayerGrid).toEqual({ x: 2, y: 5 });
  });

  it('fences interleaved autosaves until a successful service start is durable', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    expect(useGameStore.getState().activeDay!.serviceStarted).toBe(false);
    expect(useGameStore.getState().modifierDismissed).toBe(false);

    const controlled = createControlledStorage();
    const repo = createSaveRepository(controlled.storage);
    setGameSaveRepositoryForTests(repo);
    await repo.save(getGameStateSnapshot());
    const startWrite = controlled.deferNextPrimaryWrite();

    let settled = false;
    const startPromise = useGameStore
      .getState()
      .dismissModifier()
      .then(() => {
        settled = true;
      });

    expect(useGameStore.getState().activeDay!.serviceStarted).toBe(true);
    expect(useGameStore.getState().modifierDismissed).toBe(false);
    expect(useGameStore.getState().serviceStartPending).toBe(true);
    useGameStore.getState().setFloorNavPosition({ x: 2, y: 5 });
    const duplicateStart = useGameStore.getState().dismissModifier();
    await Promise.resolve();
    expect(settled).toBe(false);

    startWrite.release();
    await Promise.all([startPromise, duplicateStart]);
    await useGameStore.getState().autosave();
    expect(settled).toBe(true);
    expect(useGameStore.getState().modifierDismissed).toBe(true);
    expect(useGameStore.getState().serviceStartPending).toBe(false);

    const loaded = (await repo.load()).state!;
    expect(loaded.activeDay!.serviceStarted).toBe(true);
    expect(loaded.activeDay!.floor!.playerPosition).toEqual({ x: 2, y: 5 });
    expect(canonicalize(loaded)).toBe(canonicalize(getGameStateSnapshot()));
  });

  it('derives the modifier sheet mirror from imported service progress', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    const beforeStartCode = exportSaveCode(getGameStateSnapshot());

    resetStore(1);
    expect(
      await useGameStore.getState().importSaveCode(beforeStartCode),
    ).toEqual({ ok: true });
    expect(useGameStore.getState().activeDay!.serviceStarted).toBe(false);
    expect(useGameStore.getState().modifierDismissed).toBe(false);

    await useGameStore.getState().dismissModifier();
    const afterStartCode = exportSaveCode(getGameStateSnapshot());
    resetStore(2);
    expect(
      await useGameStore.getState().importSaveCode(afterStartCode),
    ).toEqual({ ok: true });
    expect(useGameStore.getState().activeDay!.serviceStarted).toBe(true);
    expect(useGameStore.getState().modifierDismissed).toBe(true);
  });

  it('compensates a failed interleaved service start and leaves a durable retry path', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    const controlled = createControlledStorage();
    const repo = createSaveRepository(controlled.storage);
    setGameSaveRepositoryForTests(repo);
    await repo.save(getGameStateSnapshot());
    const startWrite = controlled.deferNextPrimaryWrite();

    const startPromise = useGameStore.getState().dismissModifier();
    useGameStore.getState().setFloorNavPosition({ x: 3, y: 5 });
    startWrite.fail(new Error('storage unavailable'));

    await expect(startPromise).rejects.toThrow(
      'storage unavailable',
    );
    await useGameStore.getState().autosave();
    expect(useGameStore.getState().activeDay!.serviceStarted).toBe(false);
    expect(useGameStore.getState().modifierDismissed).toBe(false);
    expect(useGameStore.getState().serviceStartPending).toBe(false);
    expect(useGameStore.getState().serviceStartError).toBe(
      'storage unavailable',
    );
    expect(useGameStore.getState().activeDay!.floor!.playerPosition).toEqual({
      x: 3,
      y: 5,
    });

    const rolledBack = (await repo.load()).state!;
    expect(rolledBack.activeDay!.serviceStarted).toBe(false);
    expect(rolledBack.activeDay!.floor!.playerPosition).toEqual({ x: 3, y: 5 });
    expect(canonicalize(rolledBack)).toBe(canonicalize(getGameStateSnapshot()));

    await expect(useGameStore.getState().dismissModifier()).resolves.toBeUndefined();
    await useGameStore.getState().autosave();
    expect(useGameStore.getState().activeDay!.serviceStarted).toBe(true);
    expect(useGameStore.getState().modifierDismissed).toBe(true);
    expect(useGameStore.getState().serviceStartError).toBeNull();
    expect((await repo.load()).state!.activeDay!.serviceStarted).toBe(true);
  });

  it('restores a retryable sheet when both service start and compensation writes fail', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    const controlled = createControlledStorage();
    const repo = createSaveRepository(controlled.storage);
    setGameSaveRepositoryForTests(repo);
    await repo.save(getGameStateSnapshot());
    const startWrite = controlled.deferNextPrimaryWrite();
    const compensationWrite = controlled.deferNextPrimaryWrite();

    const startPromise = useGameStore.getState().dismissModifier();
    await startWrite.waitUntilStarted();
    startWrite.fail(new Error('start write failed'));
    await compensationWrite.waitUntilStarted();
    compensationWrite.fail(new Error('rollback write failed'));

    await expect(startPromise).rejects.toThrow(
      'start write failed Rollback save also failed: rollback write failed',
    );
    expect(useGameStore.getState().activeDay!.serviceStarted).toBe(false);
    expect(useGameStore.getState().modifierDismissed).toBe(false);
    expect(useGameStore.getState().serviceStartPending).toBe(false);
    expect(useGameStore.getState().serviceStartError).toBe(
      'start write failed Rollback save also failed: rollback write failed',
    );

    await expect(
      useGameStore.getState().dismissModifier(),
    ).resolves.toBeUndefined();
    expect(useGameStore.getState().activeDay!.serviceStarted).toBe(true);
    expect(useGameStore.getState().modifierDismissed).toBe(true);
    expect(useGameStore.getState().serviceStartPending).toBe(false);
    expect(useGameStore.getState().serviceStartError).toBeNull();
  });

  it('does not let a stale failed start overwrite an imported same-seed day', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    const controlled = createControlledStorage();
    const repo = createSaveRepository(controlled.storage);
    setGameSaveRepositoryForTests(repo);
    await repo.save(getGameStateSnapshot());

    const current = getGameStateSnapshot();
    const importedState = structuredClone(current);
    importedState.cash = 321;
    importedState.activeDay = {
      ...importedState.activeDay!,
      serviceStarted: true,
      floor: {
        ...importedState.activeDay!.floor!,
        playerPosition: { x: 4, y: 5 },
      },
    };
    const importCode = exportSaveCode(importedState);
    const staleStartWrite = controlled.deferNextPrimaryWrite();

    const staleStart = useGameStore.getState().dismissModifier();
    await staleStartWrite.waitUntilStarted();
    const importPromise = useGameStore.getState().importSaveCode(importCode);

    expect(useGameStore.getState().cash).toBe(321);
    expect(useGameStore.getState().activeDay!.serviceStarted).toBe(true);
    expect(useGameStore.getState().modifierDismissed).toBe(true);
    expect(useGameStore.getState().serviceStartPending).toBe(false);
    staleStartWrite.fail(new Error('stale start write failed'));

    await expect(staleStart).rejects.toThrow('stale start write failed');
    await expect(importPromise).resolves.toEqual({ ok: true });
    expect(canonicalize(getGameStateSnapshot())).toBe(
      canonicalize(importedState),
    );

    const reloaded = (await repo.load()).state!;
    expect(canonicalize(reloaded)).toBe(canonicalize(importedState));
  });

  it.each([
    ['main', false, { x: 2, y: 4 }],
    ['back_kitchen', true, { x: 1, y: 4 }],
  ] as const)(
    'restores the active %s room and player cell from a Save Code',
    async (room, annexOwned, position) => {
      await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
      const current = useGameStore.getState();
      useGameStore.setState({
        kitchenAnnexOwned: annexOwned,
        activeFloorRoom: room,
        floorPlayerGrid: { ...position },
        activeDay: {
          ...current.activeDay!,
          floor: {
            ...current.activeDay!.floor!,
            playerPosition: { ...position },
            playerRoom: room,
          },
        },
      });
      const code = exportSaveCode(getGameStateSnapshot());

      resetStore(1);
      expect(await useGameStore.getState().importSaveCode(code)).toEqual({
        ok: true,
      });
      const resumed = useGameStore.getState();
      expect(resumed.activeFloorRoom).toBe(room);
      expect(resumed.floorPlayerGrid).toEqual(position);
      expect(resumed.activeDay!.floor!.playerRoom).toBe(room);
      expect(resumed.activeDay!.floor!.playerPosition).toEqual(position);
    },
  );

  it('persists the destination room and spawn atomically on a door transition', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    useGameStore.setState({ kitchenAnnexOwned: true, composeSheetOpen: true });
    let autosaveSnapshot: ReturnType<typeof getGameStateSnapshot> | null = null;
    const autosaveSpy = vi
      .spyOn(useGameStore.getState(), 'autosave')
      .mockImplementation(async () => {
        autosaveSnapshot = getGameStateSnapshot();
      });
    autosaveSpy.mockClear();

    expect(useGameStore.getState().enterConnectingDoor()).toBe(true);
    const transitioned = useGameStore.getState();
    const spawn = connectingDoorInterior(
      'back_kitchen',
      transitioned.gridSize.w,
      transitioned.gridSize.h,
    );
    expect(transitioned.activeFloorRoom).toBe('back_kitchen');
    expect(transitioned.floorPlayerGrid).toEqual(spawn);
    expect(transitioned.activeDay!.floor!.playerRoom).toBe('back_kitchen');
    expect(transitioned.activeDay!.floor!.playerPosition).toEqual(spawn);
    expect(transitioned.composeSheetOpen).toBe(false);
    expect(autosaveSpy).toHaveBeenCalledOnce();
    expect(autosaveSnapshot!.activeDay!.floor!.playerRoom).toBe(
      'back_kitchen',
    );
    expect(autosaveSnapshot!.activeDay!.floor!.playerPosition).toEqual(spawn);

    const immediateSave = parseSaveCode(exportSaveCode(getGameStateSnapshot()));
    expect(immediateSave.activeDay!.floor!.playerRoom).toBe('back_kitchen');
    expect(immediateSave.activeDay!.floor!.playerPosition).toEqual(spawn);
  });

  it('does not allow direct room selection to teleport during service', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    useGameStore.setState({ kitchenAnnexOwned: true });

    useGameStore.getState().setActiveFloorRoom('back_kitchen');

    expect(useGameStore.getState().activeFloorRoom).toBe('main');
    expect(useGameStore.getState().activeDay!.floor!.playerRoom).toBe('main');
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

  it('autosaves an in-flight seating reservation through reload', async () => {
    const autosaveSpy = vi.spyOn(useGameStore.getState(), 'autosave').mockResolvedValue(undefined);
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    await useGameStore.getState().dismissModifier();
    for (const table of useGameStore.getState().activeDay!.floor!.tables) {
      await useGameStore.getState().dispatch({
        type: 'FLOOR_SET_TABLE',
        placementId: table.placementId,
      });
    }
    await useGameStore.getState().dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
    movePlayerToWaitingGuest();
    await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });

    const beforeSave = useGameStore.getState().activeDay!.floor!;
    const seating = beforeSave.pool.find((guest) => guest.stage === 'seating')!;
    expect(seating.seat).toBeDefined();
    expect(autosaveSpy).toHaveBeenCalled();

    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    await repo.save(getGameStateSnapshot());
    resetStore(1);
    applyHydratedState((await repo.load()).state!);

    const resumed = useGameStore.getState().activeDay!.floor!.pool.find((guest) => guest.id === seating.id)!;
    expect(resumed.stage).toBe('seating');
    expect(resumed.seat).toEqual(seating.seat);
    expect(
      useGameStore
        .getState()
        .activeDay!.floor!.tables.find((table) => table.placementId === resumed.seat!.tablePlacementId)?.state,
    ).toBe('occupied');
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

    await useGameStore.getState().dismissPendingReview();

    expect(useGameStore.getState().pendingReview).toBeNull();
    expect(useGameStore.getState().activeDay?.floor?.carriedTicketId).not.toBeNull();
  });

  it('durably acknowledges review, ceremony, and day-summary checkpoints', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    const customerId = useGameStore.getState().activeDay!.customers[0]!.id;
    useGameStore.setState({
      pendingReview: {
        customerId,
        matchStars: 8,
        tip: 14,
        ratingDelta: 0.1,
        recipeName: 'Checkpoint Plate',
      },
      ceremony: null,
      ceremonyPrestige: null,
      dayStartRating: 3,
      recentReviews: [
        {
          matchStars: 8,
          ratingDelta: 0.1,
          tip: 14,
          recipeName: 'Checkpoint Plate',
          day: 1,
        },
      ],
    });
    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    setGameSaveRepositoryForTests(repo);
    await useGameStore.getState().autosave();

    await useGameStore.getState().dismissPendingReview();
    expect((await repo.load()).presentation.pendingReview).toBeNull();

    const reset = createNewGameState(8_080);
    useGameStore.setState({
      ...reset,
      pendingReview: null,
      ceremony: 'soft_reset',
      ceremonyPrestige: null,
      dayStartRating: null,
    });
    await useGameStore.getState().autosave();
    expect((await repo.load()).presentation.ceremony).toBe('soft_reset');

    await useGameStore.getState().dismissCeremony();
    const acknowledgedCeremony = (await repo.load()).presentation;
    expect(acknowledgedCeremony.ceremony).toBeNull();
    expect(acknowledgedCeremony.ceremonyPrestige).toBeNull();

    const closed = createNewGameState(8_081);
    closed.day = 2;
    useGameStore.setState({
      ...closed,
      daySummary: {
        completedDay: 1,
        nextDay: 2,
        earningsLine: "Today's earnings: $72",
        bonusLine: null,
        volumeBonusLine: null,
        averageMatchText: 'Average match: 7.5 / 10',
        ratingDeltaText: 'Rating change: +0.10★ (3.0 → 3.1)',
        unlockProgressText: 'Ingredients unlocked: 13 / 40',
        customersServedText: 'Customers served: 4',
        masteryLine: null,
      },
      pendingReview: null,
      ceremony: null,
      ceremonyPrestige: null,
      dayStartRating: null,
    });
    await useGameStore.getState().autosave();
    expect((await repo.load()).presentation.daySummary).not.toBeNull();

    await useGameStore.getState().dismissDaySummary();
    expect((await repo.load()).presentation.daySummary).toBeNull();
  });

  it('persists and resumes the real soft-reset ceremony before its triggering review', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    await useGameStore.getState().dismissModifier();
    useGameStore.setState({ rating: 0.01 });
    const ingredientIds = worstDishForCurrentCustomer();
    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    setGameSaveRepositoryForTests(repo);

    await useGameStore.getState().dispatch({
      type: 'SERVE_DISH',
      ingredientIds,
    });
    await vi.waitFor(async () => {
      expect((await repo.load()).presentation.ceremony).toBe('soft_reset');
    });

    let state = useGameStore.getState();
    expect(state.activeDay).toBeNull();
    expect(state.dayStartRating).toBeNull();
    expect(state.ceremony).toBe('soft_reset');
    expect(state.pendingReview?.afterSoftReset).toBe(true);
    const durableReset = await repo.load();
    expect(durableReset.state?.activeDay).toBeNull();
    expect(durableReset.presentation.pendingReview?.afterSoftReset).toBe(true);
    expect(durableReset.presentation.dayStartRating).toBeNull();
    expect(durableReset.presentation.recentReviews).toHaveLength(1);

    resetStore(1);
    await useGameStore.getState().hydrate();
    state = useGameStore.getState();
    expect(state.ceremony).toBe('soft_reset');
    expect(state.pendingReview?.afterSoftReset).toBe(true);

    await state.dismissCeremony();
    expect(useGameStore.getState().ceremony).toBeNull();
    expect(useGameStore.getState().pendingReview?.afterSoftReset).toBe(true);
    expect((await repo.load()).presentation.ceremony).toBeNull();
    expect((await repo.load()).presentation.pendingReview).not.toBeNull();

    await useGameStore.getState().dismissPendingReview();
    expect((await repo.load()).presentation.pendingReview).toBeNull();
  });

  it.each(['review', 'ceremony', 'summary'] as const)(
    'keeps a failed %s acknowledgement visible and allows a durable retry',
    async (kind) => {
      await configurePresentationCheckpoint(kind);

      const controlled = createControlledStorage();
      const repo = createSaveRepository(controlled.storage);
      setGameSaveRepositoryForTests(repo);
      await useGameStore.getState().autosave();
      const failedWrite = controlled.deferNextPrimaryWrite();
      const dismiss = () => {
        const store = useGameStore.getState();
        if (kind === 'review') return store.dismissPendingReview();
        if (kind === 'ceremony') return store.dismissCeremony();
        return store.dismissDaySummary();
      };

      const failedDismissal = dismiss();
      await failedWrite.waitUntilStarted();
      failedWrite.fail(new Error('storage unavailable'));
      await expect(failedDismissal).rejects.toThrow('storage unavailable');
      expect(useGameStore.getState().presentationSavePending).toBe(false);
      expect(useGameStore.getState().presentationSaveError).toBe(
        'storage unavailable',
      );
      expect(
        kind === 'review'
          ? useGameStore.getState().pendingReview
          : kind === 'ceremony'
            ? useGameStore.getState().ceremony
            : useGameStore.getState().daySummary,
      ).not.toBeNull();

      await dismiss();
      const loaded = (await repo.load()).presentation;
      expect(
        kind === 'review'
          ? loaded.pendingReview
          : kind === 'ceremony'
            ? loaded.ceremony
            : loaded.daySummary,
      ).toBeNull();
      expect(useGameStore.getState().presentationSaveError).toBeNull();
    },
  );

  it('durably replaces a review checkpoint on NEXT_CUSTOMER and CLOSE_DAY', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    const opened = useGameStore.getState();
    const customerId = opened.activeDay!.customers[0]!.id;
    useGameStore.setState({
      activeDay: { ...opened.activeDay!, floor: null, serviceStarted: true },
      modifierDismissed: true,
      pendingReview: {
        customerId,
        matchStars: 7.8,
        tip: 12,
        ratingDelta: 0.08,
        recipeName: null,
      },
      dayStartRating: 3,
    });
    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    setGameSaveRepositoryForTests(repo);
    await useGameStore.getState().autosave();

    await useGameStore.getState().dispatch({ type: 'NEXT_CUSTOMER' });
    await vi.waitFor(async () => {
      expect((await repo.load()).state!.activeDay!.queueIndex).toBe(1);
    });
    let loaded = await repo.load();
    expect(loaded.state!.activeDay!.queueIndex).toBe(1);
    expect(loaded.presentation.pendingReview).toBeNull();

    const current = useGameStore.getState();
    useGameStore.setState({
      activeDay: {
        ...current.activeDay!,
        floor: null,
        customersServed: current.activeDay!.customers.length,
        queueIndex: current.activeDay!.customers.length - 1,
      },
      pendingReview: {
        customerId: current.activeDay!.customers.at(-1)!.id,
        matchStars: 9,
        tip: 20,
        ratingDelta: 0.2,
        recipeName: 'Final Plate',
      },
    });
    await useGameStore.getState().autosave();
    await useGameStore.getState().dispatch({ type: 'CLOSE_DAY' });
    await vi.waitFor(async () => {
      expect((await repo.load()).presentation.daySummary).not.toBeNull();
    });
    loaded = await repo.load();
    expect(loaded.state!.activeDay).toBeNull();
    expect(loaded.state!.day).toBe(2);
    expect(loaded.presentation.pendingReview).toBeNull();
    expect(loaded.presentation.daySummary).toEqual(
      useGameStore.getState().daySummary,
    );
    expect(loaded.presentation.daySummary).not.toBeNull();
  });

  it('lets a delayed checkpoint acknowledgement become the newer durable snapshot', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    const customerId = useGameStore.getState().activeDay!.customers[0]!.id;
    useGameStore.setState({
      pendingReview: {
        customerId,
        matchStars: 8.5,
        tip: 18,
        ratingDelta: 0.15,
        recipeName: 'Delayed Plate',
      },
      dayStartRating: 3,
    });
    const controlled = createControlledStorage();
    const repo = createSaveRepository(controlled.storage);
    setGameSaveRepositoryForTests(repo);
    const creationWrite = controlled.deferNextPrimaryWrite();

    const creationSave = useGameStore.getState().autosave();
    await creationWrite.waitUntilStarted();
    const acknowledgement = useGameStore.getState().dismissPendingReview();
    expect(useGameStore.getState().pendingReview).not.toBeNull();
    expect(useGameStore.getState().presentationSavePending).toBe(true);

    creationWrite.release();
    await Promise.all([creationSave, acknowledgement]);

    const loaded = await repo.load();
    expect(loaded.source).toBe('primary');
    expect(loaded.presentation.pendingReview).toBeNull();
    expect(loaded.presentation.dayStartRating).toBe(3);
    expect(useGameStore.getState().pendingReview).toBeNull();
    expect(useGameStore.getState().presentationSavePending).toBe(false);
  });

  it.each(['review', 'ceremony', 'summary'] as const)(
    'keeps a late autosave behind the durable %s acknowledgement',
    async (kind) => {
      await configurePresentationCheckpoint(kind);
      const controlled = createControlledStorage();
      const repo = createSaveRepository(controlled.storage);
      setGameSaveRepositoryForTests(repo);
      await useGameStore.getState().autosave();
      const acknowledgementWrite = controlled.deferNextPrimaryWrite();
      const store = useGameStore.getState();
      const acknowledgement =
        kind === 'review'
          ? store.dismissPendingReview()
          : kind === 'ceremony'
            ? store.dismissCeremony()
            : store.dismissDaySummary();
      await acknowledgementWrite.waitUntilStarted();

      const lateAutosave = useGameStore.getState().autosave();
      acknowledgementWrite.release();
      await Promise.all([acknowledgement, lateAutosave]);

      const loaded = (await repo.load()).presentation;
      expect(
        kind === 'review'
          ? loaded.pendingReview
          : kind === 'ceremony'
            ? loaded.ceremony
            : loaded.daySummary,
      ).toBeNull();
    },
  );
});
