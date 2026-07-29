import { describe, expect, it } from 'vitest';
import {
  equipmentCost,
  ingredientUnlockCost,
  tableCost,
} from '../domain/economy/costs.ts';
import {
  basePayout,
  computeTip,
  dayBonusEarnings,
  matchQualityFactor,
  prestigeMultiplier,
  ratingMultiplier,
  volumeBonusEarnings,
} from '../domain/economy/tips.ts';
import { applyReview, reviewDelta } from '../domain/rating/update.ts';
import { prestigeRatingDeltaMultiplier } from '../domain/balance/prestige-pacing.ts';
import { applyPrestige } from '../domain/rating/prestige.ts';
import { applySoftReset } from '../domain/rating/soft-reset.ts';
import { createNewGameState } from '../domain/state/game-state.ts';
import {
  NEW_GAME_STARTER_IDS,
  SOFT_RESET_STARTER_IDS,
} from '../domain/types.ts';

describe('economy engine', () => {
  it('matches PRD cost formulas', () => {
    expect(ingredientUnlockCost(0)).toBe(150);
    expect(ingredientUnlockCost(1)).toBe(Math.floor(150 * 1.14));
    expect(tableCost(0)).toBe(200);
    expect(equipmentCost(0)).toBe(500);
  });

  it('matches PRD tip pipeline using exact formula components', () => {
    const day = 50;
    const base = basePayout(day);
    expect(base).toBe(Math.floor(20 + 8 * Math.pow(day, 0.55)));
    expect(ratingMultiplier(4.2)).toBeCloseTo(Math.pow(4.2 / 3, 1.3), 5);
    expect(prestigeMultiplier(2)).toBeCloseTo(Math.pow(1.18, 2), 5);
    expect(matchQualityFactor(8)).toBeCloseTo(0.3 + 0.7 * Math.pow(0.8, 1.5), 5);
    expect(
      computeTip({ day, rating: 4.2, prestige: 2, matchStars: 8 }),
    ).toBe(
      Math.floor(base * ratingMultiplier(4.2) * prestigeMultiplier(2) * matchQualityFactor(8)),
    );
  });


  it('awards 5% day bonus when average match is at least 7', () => {
    expect(dayBonusEarnings(1000, 7)).toBe(50);
    expect(dayBonusEarnings(1000, 6.9)).toBe(0);
  });

  it('awards volume bonus from seat utilization, not day length', () => {
    // Full capacity: +10% of tip earnings.
    expect(volumeBonusEarnings(1000, 8, 8)).toBe(100);
    // Half seats filled: +5%.
    expect(volumeBonusEarnings(1000, 4, 8)).toBe(50);
    // Same covers with more seats → lower utilization (buy seats to raise the pool).
    expect(volumeBonusEarnings(1000, 4, 16)).toBe(25);
    // Serving more covers at full utilization scales with earnings (more seats → bigger day).
    expect(volumeBonusEarnings(2000, 16, 16)).toBe(200);
    expect(volumeBonusEarnings(1000, 0, 8)).toBe(0);
    expect(volumeBonusEarnings(0, 8, 8)).toBe(0);
  });
});

describe('rating engine', () => {
  it('applies review delta from PRD table', () => {
    expect(reviewDelta(10)).toBeCloseTo(0.2, 5);
    expect(reviewDelta(7)).toBeCloseTo(0.08, 5);
    expect(reviewDelta(5)).toBeCloseTo(0, 5);
    expect(reviewDelta(2)).toBeCloseTo(-0.12, 5);
  });

  it('clamps rating between 0 and 6', () => {
    const high = applyReview(5.9, 10);
    expect(high.prestigeTriggered).toBe(true);
    expect(high.rating).toBe(3);

    const low = applyReview(0.1, 0);
    expect(low.softResetTriggered).toBe(true);
    expect(low.rating).toBe(0);
  });

  it('triggers prestige and resets rating to 3', () => {
    const state = createNewGameState(42);
    const next = applyPrestige({ ...state, rating: 6 });
    expect(next.prestige).toBe(1);
    expect(next.rating).toBe(3);
    expect(next.stats.prestigesTotal).toBe(1);
  });

  it('soft reset keeps prestige, recipe book, layout, and mastery but wipes run progress', () => {
    const state = createNewGameState(42);
    state.prestige = 2;
    state.discoveredRecipeIds = ['recipe_a', 'recipe_b'];
    state.recipeMastery = { recipe_a: { level: 2, progress: 1 } };
    state.cash = 5000;
    state.unlockedIngredientIds = [...NEW_GAME_STARTER_IDS, 'tomato', 'basil'];
    state.purchasedEquipmentIds = ['prep_station', 'grill'];
    state.rating = 0;
    state.gridSize = { w: 6, h: 6 };
    const layout = [...state.placements, { id: 'table_3', itemKey: 'table_2seat', x: 0, y: 2, rotation: 0 }];
    state.placements = layout;
    state.tableCount = 3;
    state.seatingCapacity = 6;

    const reset = applySoftReset(state);
    expect(reset.prestige).toBe(2);
    expect(reset.discoveredRecipeIds).toEqual(['recipe_a', 'recipe_b']);
    expect(reset.recipeMastery).toEqual({ recipe_a: { level: 2, progress: 1 } });
    expect(reset.cash).toBe(100);
    expect(reset.unlockedIngredientIds).toEqual([...SOFT_RESET_STARTER_IDS]);
    expect(reset.purchasedEquipmentIds).toEqual(['prep_station']);
    expect(reset.rating).toBe(3);
    expect(reset.activeDay).toBeNull();
    expect(reset.gridSize).toEqual({ w: 6, h: 6 });
    expect(reset.placements).toEqual(layout);
    expect(reset.tableCount).toBe(3);
    expect(reset.seatingCapacity).toBe(6);
  });

  it('keeps positive rating delta at tier floors for high prestige', () => {
    for (const prestige of [10, 25, 50]) {
      const mult = prestigeRatingDeltaMultiplier(prestige);
      expect(reviewDelta(6.5, mult)).toBeGreaterThan(0);
      expect(reviewDelta(7.0, mult)).toBeGreaterThan(0);
      expect(reviewDelta(5.0, mult)).toBe(0);
    }
  });
});
