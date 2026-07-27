import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import {
  buildEquipmentShopRows,
  buildIngredientShopRows,
  buildUtilityShopRows,
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

  it('shows identical shop prices regardless of prestige', () => {
    const prestigeZero = createNewGameState(3);
    prestigeZero.prestige = 0;
    prestigeZero.cash = 100_000;
    const prestigeFive = { ...prestigeZero, prestige: 5 };
    const equipmentNames = new Map(equipment.map((item) => [item.id, item.name]));

    const costsAt = (state: typeof prestigeZero) => ({
      equipment: buildEquipmentShopRows(state, equipment, testContext).map((row) => row.cost),
      ingredients: buildIngredientShopRows(
        state,
        testContext.ingredients,
        equipmentNames,
        testContext,
      ).map((row) => row.cost),
      utilities: buildUtilityShopRows(state, testContext).map((row) => row.cost),
    });

    expect(costsAt(prestigeFive)).toEqual(costsAt(prestigeZero));
  });

  it('keeps decorations in Layout and marks the six-item limit', () => {
    const state = createNewGameState(4);
    state.cash = 100_000;

    const available = buildUtilityShopRows(state, testContext).filter(
      (row) => row.kind === 'decor',
    );
    expect(available.map((row) => [row.id, row.cost, row.availability])).toEqual([
      ['decor:decor_plant', 50, 'available'],
      ['decor:decor_flowers', 75, 'available'],
      ['decor:decor_rug', 120, 'available'],
      ['decor:decor_lamp', 150, 'available'],
      ['decor:decor_sign', 200, 'available'],
    ]);

    state.decorPurchasedCounts.decor_plant = 6;
    expect(
      buildUtilityShopRows(state, testContext)
        .filter((row) => row.kind === 'decor')
        .every((row) => row.availability === 'limit_reached'),
    ).toBe(true);
    expect(shopAvailabilityLabel('limit_reached')).toBe('Limit reached');
  });
});
