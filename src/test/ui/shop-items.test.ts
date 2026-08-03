import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import {
  buildEquipmentShopRows,
  buildIngredientShopRows,
  buildUtilityShopRows,
  shopAvailabilityLabel,
  shopRowActionLabel,
  type ShopRow,
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
    expect(rows.findIndex((row) => row.availability === 'available')).toBeLessThan(
      rows.findIndex((row) => row.availability === 'gate_locked'),
    );
    expect(rows.findIndex((row) => row.availability === 'gate_locked')).toBeLessThan(
      rows.findIndex((row) => row.availability === 'owned'),
    );

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
    expect(
      poorRows.findIndex((row) => row.availability === 'unaffordable'),
    ).toBeLessThan(
      poorRows.findIndex((row) => row.availability === 'gate_locked'),
    );
    expect(
      poorRows.findIndex((row) => row.availability === 'gate_locked'),
    ).toBeLessThan(
      poorRows.findIndex((row) => row.availability === 'owned'),
    );
    expect(shopAvailabilityLabel('gate_locked')).toBe('Needs equipment');
    expect(shopAvailabilityLabel('unaffordable')).toBe('Not enough cash');
  });


  it('orders ingredients by purchase readiness and alphabetically within each bucket', () => {
    const state = createNewGameState(5);
    state.cash = 100_000;
    const equipmentNames = new Map(equipment.map((item) => [item.id, item.name]));
    const rows = buildIngredientShopRows(
      state,
      testContext.ingredients,
      equipmentNames,
      testContext,
    );
    const bucketRank = {
      available: 0,
      unaffordable: 1,
      gate_locked: 2,
      owned: 3,
      limit_reached: 4,
    } as const;

    const actualRanks = rows.map((row) => bucketRank[row.availability]);
    expect(actualRanks).toEqual([...actualRanks].sort((left, right) => left - right));
    for (const availability of ['available', 'unaffordable', 'gate_locked', 'owned'] as const) {
      const names = rows
        .filter((row) => row.availability === availability)
        .map((row) => row.name);
      expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
    }

    const expectedValues = testContext.ingredients
      .flatMap((ingredient) =>
        buildIngredientShopRows(
          state,
          [ingredient],
          equipmentNames,
          testContext,
        ),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    expect([...rows].sort((left, right) => left.id.localeCompare(right.id))).toEqual(
      expectedValues,
    );
  });

  it('uses domain cost indices for equipment rows', () => {
    const state = createNewGameState(2);
    state.cash = 100_000;
    const rows = buildEquipmentShopRows(state, equipment, testContext);
    const grill = rows.find((row) => row.id === 'grill');
    expect(grill?.availability).toBe('available');
    expect(grill?.cost).toBeGreaterThan(0);
  });


  it('orders equipment by purchase readiness and keeps purchase-index order in each bucket', () => {
    const state = createNewGameState(6);
    state.cash = 100_000;
    state.purchasedEquipmentIds = [
      ...state.purchasedEquipmentIds,
      'oven',
      'pastry_bench',
    ];
    const rows = buildEquipmentShopRows(state, equipment, testContext);
    const purchaseIndexById = new Map(
      equipment.map((item) => [item.id, item.purchaseIndex]),
    );

    expect(rows.map((row) => row.availability)).toEqual([
      ...rows.filter((row) => row.availability === 'available').map(() => 'available' as const),
      ...rows.filter((row) => row.availability === 'owned').map(() => 'owned' as const),
    ]);
    for (const availability of ['available', 'owned'] as const) {
      const indices = rows
        .filter((row) => row.availability === availability)
        .map((row) => purchaseIndexById.get(row.id)!);
      expect(indices).toEqual([...indices].sort((left, right) => left! - right!));
    }

    const expectedValues = equipment.flatMap((item) =>
      buildEquipmentShopRows(state, [item], testContext),
    );
    expect([...rows].sort((left, right) => left.id.localeCompare(right.id))).toEqual(
      expectedValues.sort((left, right) => left.id.localeCompare(right.id)),
    );

    state.cash = 0;
    const poorRows = buildEquipmentShopRows(state, equipment, testContext);
    expect(poorRows.findIndex((row) => row.availability === 'unaffordable')).toBeLessThan(
      poorRows.findIndex((row) => row.availability === 'owned'),
    );
  });

  it('uses row-aware action copy for every shop kind and preserves unavailable reasons', () => {
    const expectedAvailableLabels: Array<[ShopRow['kind'], string]> = [
      ['ingredient', 'Buy'],
      ['equipment', 'Buy & place'],
      ['table', 'Buy & place'],
      ['decor', 'Buy & place'],
      ['grid_expansion', 'Buy'],
      ['kitchen_annex', 'Buy'],
    ];

    for (const [kind, expected] of expectedAvailableLabels) {
      expect(shopRowActionLabel({ kind, availability: 'available' })).toBe(expected);
    }

    const unavailableLabels = {
      owned: 'Owned',
      gate_locked: 'Needs equipment',
      unaffordable: 'Not enough cash',
      limit_reached: 'Limit reached',
    } as const;
    for (const kind of expectedAvailableLabels.map(([rowKind]) => rowKind)) {
      for (const [availability, expected] of Object.entries(unavailableLabels)) {
        expect(
          shopRowActionLabel({
            kind,
            availability: availability as keyof typeof unavailableLabels,
          }),
        ).toBe(expected);
      }
    }
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
