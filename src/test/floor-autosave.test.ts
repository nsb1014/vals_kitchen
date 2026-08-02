import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalize } from '../persistence/serialize.ts';
import { exportSaveCode, parseSaveCode } from '../persistence/saveCode.ts';
import { createSaveRepository, type StorageAdapter } from '../persistence/SaveRepository.ts';
import { connectingDoorInterior } from '../domain/floor/starter-map.ts';
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
    activeFloorRoom: loaded.activeDay?.floor?.playerRoom ?? 'main',
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

async function advanceFloorToOpenTicket(): Promise<string> {
  await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
  useGameStore.getState().dismissModifier();

  const floor = useGameStore.getState().activeDay!.floor!;
  for (const table of floor.tables) {
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TABLE',
      placementId: table.placementId,
    });
  }
  await useGameStore.getState().dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
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
    resetStore(7777);
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
    useGameStore.getState().dismissModifier();
    for (const table of useGameStore.getState().activeDay!.floor!.tables) {
      await useGameStore.getState().dispatch({
        type: 'FLOOR_SET_TABLE',
        placementId: table.placementId,
      });
    }
    await useGameStore.getState().dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
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

    useGameStore.getState().dismissPendingReview();

    expect(useGameStore.getState().pendingReview).toBeNull();
    expect(useGameStore.getState().activeDay?.floor?.carriedTicketId).not.toBeNull();
  });
});
