/**
 * Diagnostic: score spread for new-game starter loadout.
 * Run: node node_modules/.bin/vitest run src/test/score-compression-diagnostic.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  createRng,
  findBestMatchCombo,
  findOptimalMatchCombo,
  generateCustomerRequest,
} from '../domain/day/customer-request-generator.ts';
import { aggregateDish } from '../domain/flavor/aggregate.ts';
import { computeMatchStars } from '../domain/flavor/scoring.ts';
import { NEW_GAME_STARTER_IDS } from '../domain/types.ts';
import { testContext, testBundle } from './test-helpers.ts';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function summarize(scores: number[]) {
  const sorted = [...scores].sort((a, b) => a - b);
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  return {
    n: scores.length,
    mean: Number(mean.toFixed(3)),
    min: Number(sorted[0]!.toFixed(3)),
    max: Number(sorted[sorted.length - 1]!.toFixed(3)),
    p10: Number(percentile(sorted, 10).toFixed(3)),
    p25: Number(percentile(sorted, 25).toFixed(3)),
    p50: Number(percentile(sorted, 50).toFixed(3)),
    p75: Number(percentile(sorted, 75).toFixed(3)),
    p90: Number(percentile(sorted, 90).toFixed(3)),
  };
}

function randomBadCombo(rng: ReturnType<typeof createRng>): string[] {
  const pool = [...NEW_GAME_STARTER_IDS];
  const size = rng.nextInt(3, 6);
  const picked: string[] = [];
  while (picked.length < size && pool.length > 0) {
    const i = rng.nextInt(0, pool.length - 1);
    picked.push(pool.splice(i, 1)[0]!);
  }
  return picked;
}

function findWorstMatchCombo(
  preference: Parameters<typeof computeMatchStars>[1],
): { score: number; ingredientIds: string[] } {
  const unlockedIds = [...NEW_GAME_STARTER_IDS];
  let worstScore = Infinity;
  let worstIds: string[] = [];
  const optimal = findOptimalMatchCombo(
    unlockedIds,
    preference,
    testContext.ingredientsById,
    testContext.compoundAffinity,
  );
  // Exhaustive search over same combo space as findOptimalMatchCombo
  const ingredients = unlockedIds.map((id) => testContext.ingredientsById.get(id)!);
  const combos: string[][] = [];
  function walk(start: number, picked: string[]): void {
    if (picked.length >= 3 && picked.length <= 6) combos.push([...picked]);
    if (picked.length === 6) return;
    for (let i = start; i < ingredients.length; i++) {
      picked.push(ingredients[i]!.id);
      walk(i + 1, picked);
      picked.pop();
    }
  }
  walk(0, []);
  for (const ids of combos) {
    const score = scoreCombo(ids, preference);
    if (score < worstScore) {
      worstScore = score;
      worstIds = ids;
    }
  }
  void optimal;
  return { score: worstScore, ingredientIds: worstIds };
}

function scoreCombo(
  ids: string[],
  preference: Parameters<typeof computeMatchStars>[1],
): number {
  const ingredients = ids.map((id) => testContext.ingredientsById.get(id)!);
  const dish = aggregateDish(ingredients.map((item) => item.flavor));
  return computeMatchStars(dish, preference, ids, testContext.compoundAffinity);
}

describe('score compression diagnostic (new-game starters)', () => {
  it('reports bad vs good score distributions', () => {
    const rng = createRng(42_001);
    const sampleCount = 200;
    const badScores: number[] = [];
    const worstScores: number[] = [];
    const goodScores: number[] = [];
    const spread: number[] = [];

    for (let i = 0; i < sampleCount; i++) {
      const archetype =
        testBundle.archetypes[rng.nextInt(0, testBundle.archetypes.length - 1)]!;
      const request = generateCustomerRequest(
        archetype,
        [...NEW_GAME_STARTER_IDS],
        testContext.ingredientsById,
        rng,
        testContext.compoundAffinity,
      );
      const badIds = randomBadCombo(rng);
      const bad = scoreCombo(badIds, request.preference);
      const worst = findWorstMatchCombo(request.preference);
      const worstScore = worst.score;
      const good = findBestMatchCombo(
        [...NEW_GAME_STARTER_IDS],
        request.preference,
        testContext.ingredientsById,
        testContext.compoundAffinity,
      ).score;
      badScores.push(bad);
      worstScores.push(worstScore);
      goodScores.push(good);
      spread.push(good - worstScore);
    }

    const badSummary = summarize(badScores);
    const worstSummary = summarize(worstScores);
    const goodSummary = summarize(goodScores);
    const spreadSummary = summarize(spread);

    console.log('\n=== NEW GAME STARTER SCORE COMPRESSION DIAGNOSTIC ===');
    console.log('BAD (random combo):', JSON.stringify(badSummary));
    console.log('WORST (anti-preference combo):', JSON.stringify(worstSummary));
    console.log('GOOD (findBestMatchCombo):', JSON.stringify(goodSummary));
    console.log('SPREAD (good - worst):', JSON.stringify(spreadSummary));

    // Regression guard: early-game taste matching must be visible and consequential.
    expect(worstSummary.p50).toBeLessThan(5.5);
    expect(goodSummary.p50).toBeGreaterThanOrEqual(6.5);
    expect(spreadSummary.p50).toBeGreaterThan(2);
    expect(badSummary.n).toBe(sampleCount);
    expect(goodSummary.n).toBe(sampleCount);
  });
});
