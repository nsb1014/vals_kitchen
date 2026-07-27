import { describe, expect, it } from 'vitest';
import { spriteNameForItemKey } from '../assets/furniture-sprites.ts';
import {
  applyPlaceItem,
  applyPurchase,
  canPurchase,
  MAX_DECOR_PLACEMENTS,
  purchaseCost,
  validatePlacement,
} from '../domain/economy/purchases.ts';
import {
  createNewGameState,
  normalizeGameState,
  type GameState,
  type Placement,
} from '../domain/state/game-state.ts';
import { migrateSave } from '../persistence/saveCode.ts';
import { computeChecksum } from '../persistence/serialize.ts';
import { testContext } from './test-helpers.ts';

const COSTS = {
  decor_plant: 50,
  decor_flowers: 75,
  decor_rug: 120,
  decor_lamp: 150,
  decor_sign: 200,
} as const;

describe('decor purchases', () => {
  it.each(Object.entries(COSTS))(
    '%s costs a flat $%s regardless of quantity or prestige',
    (itemKey, expectedCost) => {
      const decorKey = itemKey as keyof typeof COSTS;
      const purchase = { type: 'decor' as const, itemKey };
      const state = createNewGameState(501);
      state.cash = 10_000;

      expect(purchaseCost(state, purchase)).toBe(expectedCost);
      const afterFirst = applyPurchase(state, purchase, testContext);
      afterFirst.prestige = 5;
      expect(purchaseCost(afterFirst, purchase)).toBe(expectedCost);

      const afterSecond = applyPurchase(afterFirst, purchase, testContext);
      expect(afterSecond.cash).toBe(state.cash - expectedCost * 2);
      expect(afterSecond.decorPurchasedCounts[decorKey]).toBe(2);
    },
  );

  it('blocks decor purchases after six total items', () => {
    let state = createNewGameState(502);
    state.cash = 10_000;
    const purchase = { type: 'decor' as const, itemKey: 'decor_plant' };

    for (let index = 0; index < MAX_DECOR_PLACEMENTS; index += 1) {
      expect(canPurchase(state, purchase, testContext)).toBe(true);
      state = applyPurchase(state, purchase, testContext);
    }

    expect(state.decorPurchasedCounts.decor_plant).toBe(MAX_DECOR_PLACEMENTS);
    expect(canPurchase(state, { type: 'decor', itemKey: 'decor_sign' }, testContext)).toBe(false);
    expect(() =>
      applyPurchase(state, { type: 'decor', itemKey: 'decor_sign' }, testContext),
    ).toThrow(/invalid purchase/i);
  });

  it('allows owned one-tile decor on dining cells and enforces the placement cap', () => {
    let state = createNewGameState(503);
    state.cash = 10_000;
    for (let index = 0; index < MAX_DECOR_PLACEMENTS; index += 1) {
      state = applyPurchase(
        state,
        { type: 'decor', itemKey: 'decor_flowers' },
        testContext,
      );
    }

    const cells = [
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
      [5, 4],
      [6, 4],
    ] as const;
    for (const [index, [x, y]] of cells.entries()) {
      const placement: Placement = {
        id: `decor_${index}`,
        itemKey: 'decor_flowers',
        x,
        y,
        rotation: 0,
      };
      expect(validatePlacement(state, placement)).toBe(true);
      state = applyPlaceItem(state, placement);
    }

    const seventh: Placement = {
      id: 'decor_seventh',
      itemKey: 'decor_flowers',
      x: 1,
      y: 5,
      rotation: 0,
    };
    expect(validatePlacement(state, seventh)).toBe(false);
    expect(() => applyPlaceItem(state, seventh)).toThrow(/invalid placement/i);
  });

  it('migrates v3 ownership counts from existing decor placements', () => {
    const legacy = createNewGameState(504) as GameState & {
      decorPurchasedCounts?: Record<string, number>;
    };
    legacy.placements.push(
      { id: 'old_plant', itemKey: 'decor_plant', x: 1, y: 4, rotation: 0 },
      { id: 'old_sign', itemKey: 'decor_sign', x: 2, y: 4, rotation: 0 },
    );
    delete (legacy as unknown as { decorPurchasedCounts?: unknown }).decorPurchasedCounts;

    const migrated = migrateSave({
      saveVersion: 3,
      checksum: computeChecksum(legacy),
      createdAt: '2026-07-27T00:00:00.000Z',
      gameState: legacy,
    });
    expect(migrated.gameState.decorPurchasedCounts).toMatchObject({
      decor_plant: 1,
      decor_sign: 1,
    });
    expect(normalizeGameState(migrated.gameState).decorPurchasedCounts).toEqual(
      migrated.gameState.decorPurchasedCounts,
    );
  });
});

describe('decor furniture sprites', () => {
  it.each(Object.keys(COSTS))('maps %s to its matching atlas frame', (itemKey) => {
    expect(spriteNameForItemKey(itemKey)).toBe(itemKey);
  });
});
