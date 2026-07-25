/**
 * Diagnostic: score spread + request diversity for new-game starter loadout.
 * Run: node node_modules/.bin/vitest run src/test/score-compression-diagnostic.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  computeFlavorEnvelope,
  computeUnlockedFlavorProfile,
  createRng,
  findBestMatchCombo,
  findOptimalMatchCombo,
  generateCustomerRequest,
} from '../domain/day/customer-request-generator.ts';
import { aggregateDish } from '../domain/flavor/aggregate.ts';
import { computeMatchStars, computeWeightedSatisfaction } from '../domain/flavor/scoring.ts';
import type { AxisKey, CustomerPreference } from '../domain/types.ts';
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

function preferenceAxisKeys(preference: CustomerPreference): AxisKey[] {
  const axes = new Set<AxisKey>();
  for (const axis of Object.keys(preference.primary) as AxisKey[]) axes.add(axis);
  for (const axis of Object.keys(preference.avoid) as AxisKey[]) {
    if (preference.avoid[axis]) axes.add(axis);
  }
  return [...axes];
}

function validatePreferencesUseUnlockedAxes(sampleCount: number, seed: number) {
  const rng = createRng(seed);
  const unlocked = NEW_GAME_STARTER_IDS.map((id) => testContext.ingredientsById.get(id)!);
  const envelope = computeFlavorEnvelope([...NEW_GAME_STARTER_IDS], testContext.ingredientsById);
  const profile = computeUnlockedFlavorProfile(unlocked, envelope);
  let offProfile = 0;

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
    for (const axis of preferenceAxisKeys(request.preference)) {
      if (!profile.actionableAxes.includes(axis)) offProfile += 1;
    }
  }

  return {
    actionableAxes: profile.actionableAxes,
    offProfileAxisReferences: offProfile,
    topVarianceAxes: [...profile.actionableAxes]
      .map((axis) => ({
        axis,
        variance: Number((profile.ingredientVariance[axis] ?? 0).toFixed(2)),
        peak: profile.ingredientMax[axis] ?? 0,
      }))
      .sort((a, b) => b.variance - a.variance),
  };
}

function summarizeRequestVariety(sampleCount: number, seed: number) {
  const rng = createRng(seed);
  const phraseSets = new Set<string>();
  const primarySignatures = new Set<string>();
  const archetypeIds = new Set<string>();
  let singlePhrase = 0;
  let minPrimaryCues = Infinity;

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
    phraseSets.add(request.preference.phrases.join(' | '));
    primarySignatures.add(
      Object.entries(request.preference.primary)
        .map(([axis, band]) => `${axis}:${band}`)
        .sort()
        .join(','),
    );
    archetypeIds.add(archetype.id);
    if (request.preference.phrases.length <= 1) singlePhrase += 1;
    minPrimaryCues = Math.min(
      minPrimaryCues,
      Object.keys(request.preference.primary).length,
    );
  }

  return {
    sampleCount,
    uniquePhraseSets: phraseSets.size,
    uniquePrimarySignatures: primarySignatures.size,
    uniqueArchetypes: archetypeIds.size,
    singlePhraseRequests: singlePhrase,
    minPrimaryCueCount: minPrimaryCues === Infinity ? 0 : minPrimaryCues,
  };
}

/** Each scored primary axis should move satisfaction when the served dish misses it. */
function measureTextScoringCoupling(
  preference: CustomerPreference,
  servedIds: string[],
): number {
  const ingredients = servedIds.map((id) => testContext.ingredientsById.get(id)!);
  const dish = aggregateDish(ingredients.map((item) => item.flavor));
  const full = computeWeightedSatisfaction(dish, preference);
  let totalDrop = 0;
  let axisCount = 0;

  for (const axis of Object.keys(preference.primary) as AxisKey[]) {
    const weakened: CustomerPreference = {
      primary: { [axis]: preference.primary[axis]! },
      avoid: {},
      phrases: preference.phrases,
    };
    const partial = computeWeightedSatisfaction(dish, weakened);
    totalDrop += Math.max(0, partial - full);
    axisCount += 1;
  }

  return axisCount === 0 ? 0 : totalDrop / axisCount;
}

describe('score compression diagnostic (new-game starters)', () => {
  it('reports bad vs good score distributions', () => {
    const rng = createRng(42_001);
    const sampleCount = 200;
    const badScores: number[] = [];
    const worstScores: number[] = [];
    const goodScores: number[] = [];
    const spread: number[] = [];
    const coupling: number[] = [];

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
      coupling.push(measureTextScoringCoupling(request.preference, worst.ingredientIds));
    }

    const variety = summarizeRequestVariety(sampleCount, 42_001);
    const dayVariety = summarizeRequestVariety(6, 42_001);
    const axisProfile = validatePreferencesUseUnlockedAxes(sampleCount, 42_001);
    const badSummary = summarize(badScores);
    const worstSummary = summarize(worstScores);
    const goodSummary = summarize(goodScores);
    const spreadSummary = summarize(spread);
    const couplingSummary = summarize(coupling);

    console.log('\n=== NEW GAME STARTER SCORE COMPRESSION DIAGNOSTIC ===');
    console.log('BAD (random combo):', JSON.stringify(badSummary));
    console.log('WORST (anti-preference combo):', JSON.stringify(worstSummary));
    console.log('GOOD (findBestMatchCombo):', JSON.stringify(goodSummary));
    console.log('SPREAD (good - worst):', JSON.stringify(spreadSummary));
    console.log('TEXT/SCORE COUPLING (avg sat drop per primary axis on worst dish):', JSON.stringify(couplingSummary));
    console.log('REQUEST VARIETY (N=200):', JSON.stringify(variety));
    console.log('REQUEST VARIETY (one 6-customer day):', JSON.stringify(dayVariety));
    console.log('UNLOCKED AXIS PROFILE:', JSON.stringify(axisProfile));

    // Regression guard: early-game taste matching must be visible and consequential.
    expect(worstSummary.min).toBeLessThanOrEqual(2);
    expect(goodSummary.max).toBeGreaterThanOrEqual(8);
    expect(worstSummary.p50).toBeLessThan(5.5);
    expect(goodSummary.p50).toBeGreaterThanOrEqual(6.5);
    expect(spreadSummary.p50).toBeGreaterThan(2);
    expect(variety.singlePhraseRequests).toBe(0);
    expect(variety.minPrimaryCueCount).toBeGreaterThanOrEqual(2);
    expect(dayVariety.uniquePhraseSets).toBeGreaterThanOrEqual(4);
    expect(couplingSummary.p50).toBeGreaterThan(0.05);
    expect(axisProfile.offProfileAxisReferences).toBe(0);
    expect(axisProfile.actionableAxes.length).toBeGreaterThanOrEqual(3);
    expect(badSummary.n).toBe(sampleCount);
    expect(goodSummary.n).toBe(sampleCount);
  });
});
