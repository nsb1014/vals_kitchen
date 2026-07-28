import { describe, expect, it } from 'vitest';
import ingredients from '../data/ingredients.json';
import equipment from '../data/equipment.json';
import recipes from '../data/recipes.json';
import archetypes from '../data/archetypes.json';
import compoundAffinity from '../data/compound-affinity.json';
import modifiers from '../data/modifiers.json';
import {
  BASE_FIRST_CYCLE_DAYS,
  MINUTES_PER_GAME_DAY,
  projectedCycleDays,
  projectedPrestigeCurve,
  prestigeRatingDeltaMultiplier,
  SIMULATION_PRESTIGE_CYCLE_CAP,
} from '../domain/balance/prestige-pacing.ts';
import { createDomainContext } from '../domain/context.ts';
import { createNewGameState } from '../domain/state/game-state.ts';
import type { DailyModifier } from '../domain/day/modifiers.ts';
import type { ContentBundle, Ingredient } from '../domain/types.ts';
import {
  buyAffordableProgress,
  playOneDay,
  simulateCompetentRun,
  simContext,
} from './sim/competent-play.ts';

const bundle: ContentBundle = {
  ingredients: ingredients as Ingredient[],
  equipment,
  recipes,
  archetypes,
  compoundAffinity,
};

const testContext = createDomainContext({
  ingredients: bundle.ingredients,
  recipes: bundle.recipes,
  archetypes: bundle.archetypes,
  modifiers: modifiers as DailyModifier[],
  compoundAffinity: bundle.compoundAffinity,
  equipment: bundle.equipment,
});

describe('prestige pacing (analytic)', () => {
  it('keeps first cycle near the fast-teach target', () => {
    expect(projectedCycleDays(0)).toBeGreaterThanOrEqual(3);
    expect(projectedCycleDays(0)).toBeLessThanOrEqual(6);
    expect(projectedCycleDays(0)).toBe(BASE_FIRST_CYCLE_DAYS);
  });

  it('projects a monotonic escalating cycle curve', () => {
    const curve = projectedPrestigeCurve(SIMULATION_PRESTIGE_CYCLE_CAP);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]!.daysInCycle).toBeGreaterThanOrEqual(curve[i - 1]!.daysInCycle);
    }
    expect(curve[curve.length - 1]!.daysInCycle).toBeGreaterThan(curve[0]!.daysInCycle);
  });

  it('documents minutes-per-day assumption used for hour totals', () => {
    expect(MINUTES_PER_GAME_DAY).toBe(10);
  });

  it('always leaves a positive rating path at high prestige', () => {
    for (const prestige of [0, 10, 25, 50]) {
      expect(prestigeRatingDeltaMultiplier(prestige)).toBeGreaterThan(0);
    }
    const floorMatch = 6.5;
    for (const prestige of [1, 25, 50]) {
      const delta = (floorMatch - 5) * 0.08 * prestigeRatingDeltaMultiplier(prestige);
      expect(delta).toBeGreaterThan(0);
    }
  });
});

describe('prestige pacing (simulated smoke)', () => {
  it('reaches first prestige in 3–10 days of competent play', () => {
    const result = simulateCompetentRun(424242, 120, simContext);
    expect(
      result.prestigeReached,
      `prestige not reached in ${result.daysPlayed} days; rating=${result.finalState.rating}`,
    ).toBe(true);
    expect(result.daysPlayed).toBeGreaterThanOrEqual(3);
    expect(result.daysPlayed).toBeLessThanOrEqual(10);
  });

  it(
    'recovers from soft-reset state without death spiral',
    () => {
      const softResetState = createNewGameState(777);
      softResetState.rating = 3;
      softResetState.cash = 100;
      softResetState.unlockedIngredientIds = bundle.ingredients
        .filter((item) => item.softResetStarter)
        .map((item) => item.id);
      softResetState.prestige = 1;

      let state = softResetState;
      for (let day = 0; day < 15; day++) {
        state = playOneDay(state, testContext);
        state = buyAffordableProgress(state, testContext);
      }

      expect(state.rating).toBeGreaterThanOrEqual(3);
      expect(state.stats.totalEarnings).toBeGreaterThan(50);
    },
    10_000,
  );
});
