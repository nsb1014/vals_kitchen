import { describe, expect, it } from 'vitest';
import { validatePlacement } from '../domain/economy/purchases.ts';
import { gameReducer } from '../domain/reducer.ts';
import { createNewGameState, type Placement } from '../domain/state/game-state.ts';
import { testContext } from './test-helpers.ts';

describe('placement via domain reducer', () => {
  it('rejects overlapping placements', () => {
    const state = createNewGameState(42);
    const occupied = state.placements.find((p) => p.itemKey.startsWith('table'))!;
    const overlap: Placement = {
      id: 'table_overlap',
      itemKey: 'table_2seat',
      x: occupied.x,
      y: occupied.y,
      rotation: 0,
    };
    expect(validatePlacement(state, overlap)).toBe(false);
    expect(() =>
      gameReducer(state, { type: 'PLACE_ITEM', placement: overlap }, testContext),
    ).toThrow(/Invalid placement/);
  });

  it('rejects out-of-bounds placements', () => {
    const state = createNewGameState(43);
    const outOfBounds: Placement = {
      id: 'oob',
      itemKey: 'table_2seat',
      x: 10,
      y: 8,
      rotation: 0,
    };
    expect(validatePlacement(state, outOfBounds)).toBe(false);
  });

  it('moves a table atomically with MOVE_ITEM', () => {
    const state = createNewGameState(44);
    const table = state.placements[0]!;
    const moved = gameReducer(
      state,
      { type: 'MOVE_ITEM', placementId: table.id, x: 1, y: 1 },
      testContext,
    ).state;
    expect(
      moved.placements.some((item) => item.id === table.id && item.x === 1 && item.y === 1),
    ).toBe(true);
    expect(moved.seatingCapacity).toBe(4);
    expect(moved.placements).toHaveLength(state.placements.length);
  });

  it('rejects invalid MOVE_ITEM and keeps the original position', () => {
    const state = createNewGameState(44);
    const table = state.placements[0]!;
    const occupiedByOther = state.placements[1]!;
    expect(() =>
      gameReducer(
        state,
        { type: 'MOVE_ITEM', placementId: table.id, x: occupiedByOther.x, y: occupiedByOther.y },
        testContext,
      ),
    ).toThrow(/Invalid placement/);
    expect(state.placements.find((item) => item.id === table.id)).toEqual(table);
  });

  it('recalculates seating capacity when removing a table', () => {
    const state = createNewGameState(45);
    const table = state.placements[0]!;
    const next = gameReducer(state, { type: 'REMOVE_ITEM', placementId: table.id }, testContext).state;
    expect(next.seatingCapacity).toBe(2);
  });

  it('allows placement on vacated tile after remove', () => {
    const state = createNewGameState(46);
    const table = state.placements[0]!;
    const removed = gameReducer(state, { type: 'REMOVE_ITEM', placementId: table.id }, testContext)
      .state;
    const moved: Placement = { ...table, x: 1, y: 1 };
    const placed = gameReducer(removed, { type: 'PLACE_ITEM', placement: moved }, testContext).state;
    expect(placed.placements).toHaveLength(state.placements.length);
    expect(placed.placements.find((item) => item.id === moved.id)).toEqual(moved);
  });
});
