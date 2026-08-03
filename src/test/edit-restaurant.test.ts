import { describe, expect, it, beforeEach } from 'vitest';
import { validatePlacement } from '../domain/economy/purchases.ts';
import { gameReducer } from '../domain/reducer.ts';
import { createNewGameState, type Placement } from '../domain/state/game-state.ts';
import { waitingGuestServicePositions } from '../domain/floor/interact.ts';
import { seatsFromPlacements } from '../domain/floor/seats.ts';
import { keepsGuestServiceReachable } from '../domain/floor/service-access.ts';
import {
  guestDoorwayLane,
  guestWaitingAlcove,
  mainGuestEntranceReservedCells,
  servicePlayerSpawn,
} from '../domain/floor/starter-map.ts';
import { useGameStore } from '../store/game-store.ts';
import { testContext } from './test-helpers.ts';

function resetStore(seed: number): void {
  useGameStore.setState({
    ...createNewGameState(seed),
    screen: 'restaurant',
    editLayoutMode: false,
    activeFloorRoom: 'main',
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

describe('edit restaurant placement rules', () => {
  it('rejects tables on kitchen tiles and stations on dining tiles', () => {
    const state = createNewGameState(101);
    const tableOnKitchen: Placement = {
      id: 'bad_table',
      itemKey: 'table_2seat',
      x: 8,
      y: 3,
      rotation: 0,
    };
    const stationOnDining: Placement = {
      id: 'bad_station',
      itemKey: 'prep_station',
      x: 3,
      y: 3,
      rotation: 0,
    };
    expect(validatePlacement(state, tableOnKitchen)).toBe(false);
    expect(validatePlacement(state, stationOnDining)).toBe(false);
  });

  it('rejects tables whose side seats land on walls or other furniture', () => {
    const state = createNewGameState(102);
    // x=1 puts west seat on perimeter wall (x=0)
    const againstWall: Placement = {
      id: 'wall_table',
      itemKey: 'table_2seat',
      x: 1,
      y: 3,
      rotation: 0,
    };
    expect(validatePlacement(state, againstWall)).toBe(false);

    const table = state.placements.find((p) => p.itemKey.startsWith('table'))!;
    // Overlap east seat of table_1 (x=3,y=2) by sitting at x=4,y=2
    const seatClash: Placement = {
      id: 'clash',
      itemKey: 'table_2seat',
      x: 4,
      y: 2,
      rotation: 0,
    };
    expect(validatePlacement(state, seatClash)).toBe(false);
    expect(validatePlacement(state, { ...table, x: 3, y: 4 }, table.id)).toBe(true);
  });

  it('rejects a layout that strands every service position around a stool', () => {
    const state = createNewGameState(1021);
    const secondTable = state.placements.find((placement) => placement.id === 'table_2')!;

    // The west stool of table_1 is at (1,2). In this otherwise collision-free
    // move its service cells become wall, table_1, wall, and table_2's stool.
    expect(
      validatePlacement(
        state,
        { ...secondTable, x: 2, y: 4 },
        secondTable.id,
      ),
    ).toBe(false);
  });

  it('rejects exact blockers that isolate the guest alcove and departure lane', () => {
    const state = createNewGameState(10211);
    const blockerPositions = [
      { x: 1, y: 6 },
      { x: 2, y: 5 },
      { x: 3, y: 5 },
    ];
    state.placements = [
      ...state.placements,
      ...blockerPositions.map((position, index) => ({
        id: `route_blocker_${index}`,
        itemKey: 'decor_plant',
        ...position,
        rotation: 0,
      })),
    ];
    const before = structuredClone(state.placements);

    expect(
      validatePlacement(state, {
        id: 'route_blocker_3',
        itemKey: 'decor_plant',
        x: 4,
        y: 6,
        rotation: 0,
      }),
    ).toBe(false);
    expect(state.placements).toEqual(before);
  });

  it('rejects the sequential blocker that removes the final reachable greeting endpoint', () => {
    const state = createNewGameState(10212);
    const blockers = waitingGuestServicePositions(
      state.gridSize.w,
      state.gridSize.h,
    ).map(
      (position, index) =>
        ({
          id: `greeting_blocker_${index}`,
          itemKey: 'decor_plant',
          ...position,
          rotation: 0,
        }) satisfies Placement,
    );
    const finalBlocker = blockers.pop()!;

    for (const blocker of blockers) {
      expect(validatePlacement(state, blocker)).toBe(true);
      state.placements.push(blocker);
      expect(
        keepsGuestServiceReachable(
          state.gridSize,
          state.placements,
          state.kitchenAnnexOwned,
        ),
      ).toBe(true);
    }

    const before = structuredClone(state.placements);
    expect(validatePlacement(state, finalBlocker)).toBe(false);
    expect(state.placements).toEqual(before);
    expect(
      keepsGuestServiceReachable(
        state.gridSize,
        [...state.placements, finalBlocker],
        state.kitchenAnnexOwned,
      ),
    ).toBe(false);
  });

  it('keeps the service-day spawn open even when the layout has no stools', () => {
    const state = createNewGameState(1022);
    state.gridSize = { w: 4, h: 4 };
    state.placements = [];
    const spawn = servicePlayerSpawn(state.gridSize.w, state.gridSize.h);

    expect(
      validatePlacement(state, {
        id: 'spawn_station',
        itemKey: 'prep_station',
        ...spawn,
        rotation: 0,
      }),
    ).toBe(false);
  });

  it('moves a table and keeps relative side seats attached', () => {
    const state = createNewGameState(103);
    const table = state.placements.find((p) => p.id === 'table_1')!;
    const beforeSeats = seatsFromPlacements([table]);
    const moved = gameReducer(
      state,
      { type: 'MOVE_ITEM', placementId: table.id, x: 3, y: 4 },
      testContext,
    ).state;
    const after = moved.placements.find((p) => p.id === table.id)!;
    const afterSeats = seatsFromPlacements([after]);
    expect(after.x).toBe(3);
    expect(after.y).toBe(4);
    expect(afterSeats).toHaveLength(beforeSeats.length);
    expect(afterSeats.map((s) => ({ dx: s.x - after.x, dy: s.y - after.y, facing: s.facing }))).toEqual(
      beforeSeats.map((s) => ({ dx: s.x - table.x, dy: s.y - table.y, facing: s.facing })),
    );
  });

  it('keeps the main guest door, doorway lane, and waiting alcove free', () => {
    const state = createNewGameState(104);
    const reserved = mainGuestEntranceReservedCells(state.gridSize.w, state.gridSize.h);
    const [door, lane, alcove] = reserved;

    expect(lane).toEqual(guestDoorwayLane(door!));
    expect(alcove).toEqual(guestWaitingAlcove(door!));
    expect(guestWaitingAlcove({ x: 1, y: 3 })).toEqual({ x: 2, y: 2 });
    expect(new Set(reserved.map((cell) => `${cell.x},${cell.y}`)).size).toBe(3);

    for (const [index, cell] of reserved.entries()) {
      expect(
        validatePlacement(state, {
          id: `reserved_${index}`,
          itemKey: 'decor_plant',
          x: cell.x,
          y: cell.y,
          rotation: 0,
        }),
      ).toBe(false);
    }
  });

  it('rejects a table when any derived seat occupies the entrance corridor', () => {
    const state = createNewGameState(105);
    const [, lane, alcove] = mainGuestEntranceReservedCells(
      state.gridSize.w,
      state.gridSize.h,
    );

    const seatOnLane: Placement = {
      id: 'seat_on_lane',
      itemKey: 'table_4seat',
      x: lane!.x,
      y: lane!.y - 1,
      rotation: 0,
    };
    const seatInAlcove: Placement = {
      id: 'seat_in_alcove',
      itemKey: 'table_4seat',
      x: alcove!.x,
      y: alcove!.y - 1,
      rotation: 0,
    };

    expect(seatsFromPlacements([seatOnLane])).toContainEqual(
      expect.objectContaining({ x: lane!.x, y: lane!.y }),
    );
    expect(seatsFromPlacements([seatInAlcove])).toContainEqual(
      expect.objectContaining({ x: alcove!.x, y: alcove!.y }),
    );
    expect(validatePlacement(state, seatOnLane)).toBe(false);
    expect(validatePlacement(state, seatInAlcove)).toBe(false);
  });

  it('does not apply the main entrance reservation to the back kitchen', () => {
    const state = { ...createNewGameState(106), kitchenAnnexOwned: true };
    const [, lane] = mainGuestEntranceReservedCells(state.gridSize.w, state.gridSize.h);
    const station: Placement = {
      id: 'back_prep',
      itemKey: 'prep_station',
      x: lane!.x,
      y: lane!.y,
      rotation: 0,
    };

    expect(validatePlacement(state, station, undefined, 'back_kitchen')).toBe(true);
  });
});

describe('edit restaurant mode gating', () => {
  beforeEach(() => {
    resetStore(202);
  });

  it('allows toggle between days and locks layout when the day opens', async () => {
    const store = useGameStore.getState();
    expect(store.activeDay).toBeNull();
    expect(store.editLayoutMode).toBe(false);

    store.toggleEditLayout();
    expect(useGameStore.getState().editLayoutMode).toBe(true);

    const table = useGameStore.getState().placements.find((p) => p.id === 'table_1')!;
    expect(useGameStore.getState().movePlacement(table.id, 3, 4)).toBe(true);
    expect(useGameStore.getState().placements.find((p) => p.id === table.id)).toMatchObject({
      x: 3,
      y: 4,
    });

    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    const during = useGameStore.getState();
    expect(during.activeDay).not.toBeNull();
    expect(during.editLayoutMode).toBe(false);

    during.toggleEditLayout();
    expect(useGameStore.getState().editLayoutMode).toBe(false);
    expect(useGameStore.getState().movePlacement(table.id, 2, 2)).toBe(false);
    expect(useGameStore.getState().placements.find((p) => p.id === table.id)).toMatchObject({
      x: 3,
      y: 4,
    });

    expect(() =>
      gameReducer(
        {
          ...createNewGameState(202),
          activeDay: useGameStore.getState().activeDay,
          placements: useGameStore.getState().placements,
        },
        { type: 'MOVE_ITEM', placementId: table.id, x: 2, y: 3 },
        testContext,
      ),
    ).toThrow(/during service/);
  });

  it('rejects moving furniture onto the final reachable greeting endpoint', () => {
    const state = createNewGameState(203);
    const blockers = waitingGuestServicePositions(
      state.gridSize.w,
      state.gridSize.h,
    ).map(
      (position, index) =>
        ({
          id: `store_greeting_blocker_${index}`,
          itemKey: 'decor_plant',
          ...position,
          rotation: 0,
        }) satisfies Placement,
    );
    const finalBlocker = blockers.pop()!;

    for (const blocker of blockers) {
      expect(validatePlacement(state, blocker)).toBe(true);
      state.placements.push(blocker);
    }

    const endpointKeys = new Set(
      waitingGuestServicePositions(state.gridSize.w, state.gridSize.h).map(
        (position) => `${position.x},${position.y}`,
      ),
    );
    let movable: Placement | undefined;
    for (let y = 0; y < state.gridSize.h && !movable; y += 1) {
      for (let x = 0; x < state.gridSize.w; x += 1) {
        if (endpointKeys.has(`${x},${y}`)) continue;
        const candidate: Placement = {
          id: 'movable_greeting_blocker',
          itemKey: 'decor_plant',
          x,
          y,
          rotation: 0,
        };
        if (validatePlacement(state, candidate)) {
          movable = candidate;
          break;
        }
      }
    }
    expect(movable).toBeDefined();
    state.placements.push(movable!);
    useGameStore.setState({
      ...state,
      screen: 'restaurant',
      editLayoutMode: true,
      activeFloorRoom: 'main',
      hydrated: true,
    });
    const before = structuredClone(useGameStore.getState().placements);

    expect(
      useGameStore
        .getState()
        .movePlacement(movable!.id, finalBlocker.x, finalBlocker.y),
    ).toBe(false);
    expect(useGameStore.getState().placements).toEqual(before);
  });
});
