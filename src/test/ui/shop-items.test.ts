import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import {
  buildEquipmentShopRows,
  buildIngredientShopRows,
  shopAvailabilityLabel,
} from '../../ui/presentation/shop-items.ts';
import { testContext } from '../test-helpers.ts';
import equipment from '../../data/equipment.json';

describe('shop item presentation', () => {
  it('marks ingredients gate-locked vs unaffordable differently', () => {
    const state = createNewGameState(1);
    state.cash = 50_000;
    const rows = buildIngredientShopRows(
      state,
      testContext.ingredients,
      new Map(equipment.map((item) => [item.id, item.name])),
      testContext,
    );

    const locked = rows.find((row) => row.availability === 'gate_locked');
    const unaffordable = rows.find((row) => row.availability === 'unaffordable');

    expect(locked).toBeDefined();
    expect(unaffordable).toBeUndefined();

    state.cash = 0;
    const poorRows = buildIngredientShopRows(
      state,
      testContext.ingredients,
      new Map(equipment.map((item) => [item.id, item.name])),
      testContext,
    );
    const gateOwnedPoor = poorRows.find(
      (row) =>
        row.availability === 'unaffordable' &&
        testContext.ingredientsById.get(row.id)!.equipmentId === 'prep_station',
    );
    expect(gateOwnedPoor).toBeDefined();
    expect(shopAvailabilityLabel('gate_locked')).toBe('Needs equipment');
    expect(shopAvailabilityLabel('unaffordable')).toBe('Not enough cash');
  });

  it('uses domain cost indices for equipment rows', () => {
    const state = createNewGameState(2);
    state.cash = 100_000;
    const rows = buildEquipmentShopRows(state, equipment, testContext);
    const grill = rows.find((row) => row.id === 'grill');
    expect(grill?.availability).toBe('available');
    expect(grill?.cost).toBeGreaterThan(0);
  });
});
