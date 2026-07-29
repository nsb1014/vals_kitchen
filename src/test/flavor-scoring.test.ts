import { describe, expect, it } from 'vitest';
import { aggregateDish } from '../domain/flavor/aggregate.ts';
import {
  bandSatisfaction,
  computeIdealCloseness,
  computeMatchStars,
  computeRequestSatisfaction,
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

  it('awards full credit inside the displayed low, moderate, and high bands', () => {
    expect(bandSatisfaction(2, 'low')).toBe(1);
    expect(bandSatisfaction(5, 'mid')).toBe(1);
    expect(bandSatisfaction(8, 'high')).toBe(1);
  });

  it('clamps satisfaction instead of making an overshot moderate flavor negative', () => {
    expect(bandSatisfaction(9, 'mid')).toBeCloseTo(1 / 3, 5);
    expect(bandSatisfaction(10, 'mid')).toBe(0);
    expect(bandSatisfaction(0, 'high')).toBe(0);
  });

  it('computes weighted satisfaction for primary high band', () => {
    const dish = { ...neutralDish(), UM: 8 };
    const preference: CustomerPreference = {
      primary: { UM: 'high' },
      avoid: {},
      phrases: [],
    };
    expect(computeWeightedSatisfaction(dish, preference)).toBe(1);
  });

  it('gives the displayed Rich Indulger target full request credit', () => {
    const displayedIdeal = {
      ...neutralDish(),
      UM: 5,
      PU: 2,
      RI: 8,
    };
    const preference: CustomerPreference = {
      primary: { UM: 'mid', PU: 'low', RI: 'high' },
      avoid: {},
      phrases: ['moderate Umami', 'low Pungent', 'high Rich'],
      idealProfile: displayedIdeal,
    };
    const allHighUmami = {
      ...displayedIdeal,
      UM: 9,
      PU: 0,
    };

    expect(computeWeightedSatisfaction(displayedIdeal, preference)).toBe(1);
    expect(computeIdealCloseness(displayedIdeal, preference)).toBe(1);
    expect(computeRequestSatisfaction(displayedIdeal, preference)).toBe(1);
    expect(computeMatchStars(displayedIdeal, preference, [], {})).toBe(9);
    expect(computeWeightedSatisfaction(allHighUmami, preference)).toBeCloseTo(
      7 / 9,
      5,
    );
    expect(computeMatchStars(allHighUmami, preference, [], {})).toBeCloseTo(
      6.73,
      2,
    );
  });

  it('keeps several band-matching solutions strong while ranking the ideal first', () => {
    const ideal = { ...neutralDish(), UM: 5, PU: 2, RI: 8 };
    const closeAlternative = { ...ideal, UM: 6, PU: 3, RI: 7 };
    const edgeAlternative = { ...ideal, UM: 7, PU: 0, RI: 10 };
    const preference: CustomerPreference = {
      primary: { UM: 'mid', PU: 'low', RI: 'high' },
      avoid: {},
      phrases: ['moderate Umami', 'low Pungent', 'high Rich'],
      idealProfile: ideal,
    };

    for (const dish of [ideal, closeAlternative, edgeAlternative]) {
      expect(computeWeightedSatisfaction(dish, preference)).toBe(1);
    }
    expect(computeIdealCloseness(ideal, preference)).toBe(1);
    expect(computeIdealCloseness(closeAlternative, preference)).toBeCloseTo(
      0.8,
      5,
    );
    expect(computeIdealCloseness(edgeAlternative, preference)).toBeCloseTo(
      0.6,
      5,
    );

    const idealScore = computeMatchStars(ideal, preference, [], {});
    const closeScore = computeMatchStars(closeAlternative, preference, [], {});
    const edgeScore = computeMatchStars(edgeAlternative, preference, [], {});
    expect(idealScore).toBe(9);
    expect(closeScore).toBeCloseTo(8.7, 5);
    expect(edgeScore).toBeCloseTo(8.4, 5);
    expect(idealScore).toBeGreaterThan(closeScore);
    expect(closeScore).toBeGreaterThan(edgeScore);
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
      a: { b: 0.5 },
      b: { a: 0.5 },
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
