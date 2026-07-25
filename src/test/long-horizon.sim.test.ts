import { describe, expect, it } from 'vitest';
import ingredients from '../data/ingredients.json';
import equipment from '../data/equipment.json';
import recipes from '../data/recipes.json';
import archetypes from '../data/archetypes.json';
import compoundAffinity from '../data/compound-affinity.json';
import {
  ANALYTIC_SIM_CUMULATIVE_TOLERANCE,
  ANALYTIC_SIM_PER_CYCLE_TOLERANCE,
  MINUTES_PER_GAME_DAY,
  OBSERVED_HOURS_SANITY_MAX,
  OBSERVED_HOURS_SANITY_MIN,
  projectedCycleDays,
  SIMULATION_PRESTIGE_CYCLE_CAP,
} from '../domain/balance/prestige-pacing.ts';
import { createNewGameState } from '../domain/state/game-state.ts';
import type { ContentBundle, Ingredient } from '../domain/types.ts';
import {
  formatPrestigeCurveReport,
  simulateCompetentRun,
  simulatePrestigeCurve,
} from './sim/competent-play.ts';

const bundle: ContentBundle = {
  ingredients: ingredients as Ingredient[],
  equipment,
  recipes,
  archetypes,
  compoundAffinity,
};

function highPrestigeStart(prestige: number) {
  const start = createNewGameState(9000 + prestige);
  start.prestige = prestige;
  start.cash = 20_000;
  const pantrySize = prestige >= 50 ? 12 : 20;
  start.unlockedIngredientIds = bundle.ingredients.slice(0, pantrySize).map((item) => item.id);
  start.purchasedEquipmentIds = ['prep_station', 'grill', 'oven', 'fryer'];
  start.ingredientUnlockIndex = start.unlockedIngredientIds.length - 9;
  return start;
}

describe('long-horizon progression (deep sim)', () => {
  it('reports full prestige curve, analytic agreement, and high-prestige winnability', {
    timeout: 900_000,
  }, () => {
    const curve = simulatePrestigeCurve(424242, SIMULATION_PRESTIGE_CYCLE_CAP, 500);
    const report = formatPrestigeCurveReport(
      'PRESTIGE CURVE (competent, seed 424242)',
      curve,
      MINUTES_PER_GAME_DAY,
    );
    console.log(report);

    expect(curve.length).toBe(SIMULATION_PRESTIGE_CYCLE_CAP);
    expect(curve.every((row) => row.reached)).toBe(true);
    expect(curve[0]!.daysInCycle).toBeGreaterThanOrEqual(5);
    expect(curve[0]!.daysInCycle).toBeLessThanOrEqual(12);

    expect(curve[curve.length - 1]!.daysInCycle).toBeGreaterThan(curve[0]!.daysInCycle);

    const half = Math.floor(curve.length / 2);
    const firstHalfAvg =
      curve.slice(0, half).reduce((sum, row) => sum + row.daysInCycle, 0) / half;
    const secondHalfAvg =
      curve.slice(half).reduce((sum, row) => sum + row.daysInCycle, 0) / (curve.length - half);
    expect(secondHalfAvg).toBeGreaterThan(firstHalfAvg);

    const last = curve[curve.length - 1]!;
    expect(last.cumulativeHours).toBeGreaterThanOrEqual(OBSERVED_HOURS_SANITY_MIN);
    expect(last.cumulativeHours).toBeLessThanOrEqual(OBSERVED_HOURS_SANITY_MAX);
    console.log(`OBSERVED cumulative_hours=${last.cumulativeHours.toFixed(1)} (sanity ${OBSERVED_HOURS_SANITY_MIN}–${OBSERVED_HOURS_SANITY_MAX})`);

    let simCumulativeDays = 0;
    let projectedCumulativeDays = 0;
    for (let i = 0; i < curve.length; i++) {
      const simRow = curve[i]!;
      const projectedDays = projectedCycleDays(simRow.prestigeFrom);
      const perCycleError =
        Math.abs(projectedDays - simRow.daysInCycle) / Math.max(1, simRow.daysInCycle);
      expect(
        perCycleError,
        `cycle ${simRow.cycle} P=${simRow.prestigeFrom} sim=${simRow.daysInCycle} projected=${projectedDays}`,
      ).toBeLessThanOrEqual(ANALYTIC_SIM_PER_CYCLE_TOLERANCE);
      simCumulativeDays += simRow.daysInCycle;
      projectedCumulativeDays += projectedDays;
    }
    const cumulativeError =
      Math.abs(projectedCumulativeDays - simCumulativeDays) / Math.max(1, simCumulativeDays);
    expect(cumulativeError).toBeLessThanOrEqual(ANALYTIC_SIM_CUMULATIVE_TOLERANCE);

    for (const prestige of [10, 25, 50]) {
      const start = highPrestigeStart(prestige);
      const maxDays = prestige >= 50 ? 900 : prestige >= 25 ? 500 : 350;
      const result = simulateCompetentRun(9000 + prestige, maxDays, undefined, start, {
        shop: true,
      });
      expect(
        result.prestigeReached,
        `P=${prestige} not winnable with shop in ${result.daysPlayed} days; rating=${result.finalState.rating}`,
      ).toBe(true);
    }
  });

  it('diagnostic: high-prestige winnability with fixed mid-run pantry (shop disabled)', {
    timeout: 900_000,
  }, () => {
    for (const prestige of [10, 25, 50]) {
      const start = highPrestigeStart(prestige);
      const maxDays = prestige >= 50 ? 900 : prestige >= 25 ? 500 : 350;
      const result = simulateCompetentRun(9000 + prestige, maxDays, undefined, start, {
        shop: false,
      });
      expect(
        result.prestigeReached,
        `P=${prestige} fixed-pantry diagnostic failed in ${result.daysPlayed} days; rating=${result.finalState.rating}`,
      ).toBe(true);
    }
  });
});
