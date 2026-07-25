import { describe, expect, it } from 'vitest';
import { generateDay, serializeDayForComparison } from '../domain/day/generate.ts';
import { findBestMatchCombo } from '../domain/day/customer-request-generator.ts';
import { isDayComplete } from '../domain/day/serve.ts';
import { gameReducer } from '../domain/reducer.ts';
import { createNewGameState } from '../domain/state/game-state.ts';
import { testBundle, testContext } from './test-helpers.ts';

describe('day determinism', () => {
  it('produces byte-identical output for the same seed', () => {
    const input = {
      globalRunSeed: 123456789,
      day: 15,
      prestige: 1,
      rating: 3.5,
      seatingCapacity: 8,
      unlockedIngredientIds: testBundle.ingredients.slice(0, 12).map((item) => item.id),
    };

    const dayA = generateDay(input, testContext);
    const dayB = generateDay(input, testContext);
    expect(serializeDayForComparison(dayA)).toBe(serializeDayForComparison(dayB));
  });

  it('replays reducer day flow deterministically', () => {
    const seed = 987654321;
    let stateA = createNewGameState(seed);
    let stateB = createNewGameState(seed);

    stateA = gameReducer(stateA, { type: 'OPEN_DAY' }, testContext).state;
    stateB = gameReducer(stateB, { type: 'OPEN_DAY' }, testContext).state;

    expect(stateA.activeDay?.customers.length).toBe(stateB.activeDay?.customers.length);
    expect(stateA.activeDay?.seed).toBe(stateB.activeDay?.seed);

    while (stateA.activeDay && !isDayComplete(stateA)) {
      const customer = stateA.activeDay.customers[stateA.activeDay.queueIndex]!;
      const best = findBestMatchCombo(
        stateA.unlockedIngredientIds,
        customer.preference,
        testContext.ingredientsById,
        testContext.compoundAffinity,
      );

      stateA = gameReducer(stateA, { type: 'SERVE_DISH', ingredientIds: best.ingredientIds }, testContext).state;
      stateB = gameReducer(stateB, { type: 'SERVE_DISH', ingredientIds: best.ingredientIds }, testContext).state;

      if (stateA.activeDay && !isDayComplete(stateA)) {
        stateA = gameReducer(stateA, { type: 'NEXT_CUSTOMER' }, testContext).state;
        stateB = gameReducer(stateB, { type: 'NEXT_CUSTOMER' }, testContext).state;
      }
    }

    expect(stateA.cash).toBe(stateB.cash);
    expect(stateA.rating).toBe(stateB.rating);
    expect(stateA.activeDay?.customersServed).toBe(stateB.activeDay?.customersServed);
  });
});
