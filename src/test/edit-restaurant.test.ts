import { describe, expect, it, beforeEach } from 'vitest';
import { validatePlacement } from '../domain/economy/purchases.ts';
import { gameReducer } from '../domain/reducer.ts';
import { createNewGameState, type Placement } from '../domain/state/game-state.ts';
import { seatsFromPlacements } from '../domain/floor/seats.ts';
import { useGameStore } from '../store/game-store.ts';
import { testContext } from './test-helpers.ts';

function resetStore(seed: number): void {
  useGameStore.setState({
    ...createNewGameState(seed),
    screen: 'restaurant',
    editLayoutMode: false,
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
});
