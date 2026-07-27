import { describe, expect, it } from 'vitest';
import {
  applyPurchase,
  canPurchase,
  purchaseCost,
  type PurchaseKind,
} from '../domain/economy/purchases.ts';
import { createNewGameState } from '../domain/state/game-state.ts';
import { testContext } from './test-helpers.ts';

function availableIngredientPurchase(): PurchaseKind {
  const state = createNewGameState(1);
  const ingredient = testContext.ingredients.find(
    (item) =>
      item.equipmentId === 'prep_station' &&
      !state.unlockedIngredientIds.includes(item.id),
  );
  expect(ingredient).toBeDefined();
  return { type: 'ingredient', ingredientId: ingredient!.id };
}

function allPurchaseKinds(): PurchaseKind[] {
  return [
    availableIngredientPurchase(),
    { type: 'equipment', equipmentId: 'grill' },
    { type: 'table' },
    { type: 'grid_expansion' },
    { type: 'kitchen_annex' },
  ];
}

describe('purchase costs', () => {
  it('keeps every purchase cost identical at prestige 0 and prestige 5', () => {
    const prestigeZero = createNewGameState(2);
    prestigeZero.prestige = 0;
    const prestigeFive = { ...prestigeZero, prestige: 5 };

    for (const purchase of allPurchaseKinds()) {
      expect(purchaseCost(prestigeFive, purchase)).toBe(
        purchaseCost(prestigeZero, purchase),
      );
    }
  });

  it('uses the same affordability and cash deduction at prestige 0 and prestige 5', () => {
    for (const purchase of allPurchaseKinds()) {
      const prestigeZero = createNewGameState(2);
      prestigeZero.prestige = 0;
      prestigeZero.cash = purchaseCost(prestigeZero, purchase);

      const prestigeFive = createNewGameState(2);
      prestigeFive.prestige = 5;
      prestigeFive.cash = prestigeZero.cash;

      expect(canPurchase(prestigeZero, purchase, testContext)).toBe(true);
      expect(canPurchase(prestigeFive, purchase, testContext)).toBe(true);

      const afterZero = applyPurchase(prestigeZero, purchase, testContext);
      const afterFive = applyPurchase(prestigeFive, purchase, testContext);
      expect(prestigeZero.cash - afterZero.cash).toBe(prestigeFive.cash - afterFive.cash);
    }
  });
});
