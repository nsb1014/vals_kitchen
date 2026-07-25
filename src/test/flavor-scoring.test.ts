import { describe, expect, it } from 'vitest';
import { aggregateDish } from '../domain/flavor/aggregate.ts';
import {
  computeMatchStars,
  computeWeightedSatisfaction,
  meanPairAffinity,
} from '../domain/flavor/scoring.ts';
import { RECIPE_MATCH_BONUS } from '../domain/flavor/recipe-match.ts';
import type { CustomerPreference, FlavorVector } from '../domain/types.ts';

const neutralDish = (): FlavorVector => ({
  SW: 5,
  SA: 5,
  SO: 5,
  BI: 5,
  UM: 5,
  HE: 5,
  FR: 5,
  EA: 5,
  SM: 5,
  PU: 5,
  NU: 5,
  RI: 5,
  LI: 5,
  HT: 5,
  CR: 5,
  TE: 0,
});

describe('flavor scoring', () => {
  it('aggregates taste axes with alpha 0.25', () => {
    const a: FlavorVector = { ...neutralDish(), UM: 4 };
    const b: FlavorVector = { ...neutralDish(), UM: 8 };
    const dish = aggregateDish([a, b]);
    expect(dish.UM).toBeCloseTo(0.75 * 6 + 0.25 * 8, 5);
  });

  it('aggregates aroma axes with alpha 0.40', () => {
    const a: FlavorVector = { ...neutralDish(), HE: 2 };
    const b: FlavorVector = { ...neutralDish(), HE: 8 };
    const dish = aggregateDish([a, b]);
    expect(dish.HE).toBeCloseTo(0.6 * 5 + 0.4 * 8, 5);
  });

  it('uses temperature mode with tie-break toward hot', () => {
    const cold: FlavorVector = { ...neutralDish(), TE: -1 };
    const hot: FlavorVector = { ...neutralDish(), TE: 1 };
    expect(aggregateDish([cold, hot]).TE).toBe(1);
    expect(aggregateDish([cold, cold, hot]).TE).toBe(-1);
  });

  it('computes weighted satisfaction for primary high band', () => {
    const dish = { ...neutralDish(), UM: 8 };
    const preference: CustomerPreference = {
      primary: { UM: 'high' },
      avoid: {},
      phrases: [],
    };
    expect(computeWeightedSatisfaction(dish, preference)).toBeCloseTo(0.8, 4);
  });

  it('applies avoid penalty when dish exceeds threshold', () => {
    const dish = { ...neutralDish(), SW: 6 };
    const preference: CustomerPreference = {
      primary: { UM: 'high' },
      avoid: { SW: true },
      phrases: [],
    };
    const withoutAvoid = computeWeightedSatisfaction(
      { ...dish, SW: 4 },
      preference,
    );
    const withAvoid = computeWeightedSatisfaction(dish, preference);
    expect(withAvoid).toBeLessThan(withoutAvoid);
  });

  it('computes match stars with affinity and recipe bonus', () => {
    const dish = neutralDish();
    const preference: CustomerPreference = {
      primary: { UM: 'mid', SO: 'mid' },
      avoid: {},
      phrases: [],
    };
    const matrix = {
      a: { b: 1 },
      b: { a: 1 },
    };
    const base = computeMatchStars(dish, preference, ['a', 'b', 'c'], matrix, 0);
    const withRecipe = computeMatchStars(
      dish,
      preference,
      ['a', 'b', 'c'],
      matrix,
      RECIPE_MATCH_BONUS,
    );
    expect(withRecipe - base).toBeCloseTo(RECIPE_MATCH_BONUS, 5);
    expect(withRecipe).toBeLessThanOrEqual(10);
  });

  it('returns mean pairwise affinity', () => {
    const matrix = {
      a: { b: 0.5, c: 0.25 },
      b: { a: 0.5, c: 0.75 },
      c: { a: 0.25, b: 0.75 },
    };
    expect(meanPairAffinity(['a', 'b', 'c'], matrix)).toBeCloseTo(0.5, 5);
  });
});
