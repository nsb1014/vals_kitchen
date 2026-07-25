import type { Archetype, AxisKey, Band, CustomerPreference, FlavorVector, Ingredient } from '../types.ts';
import { AXIS_KEYS } from '../types.ts';
import { aggregateDish } from '../flavor/aggregate.ts';
import { computeMatchStars } from '../flavor/scoring.ts';
import { createRng, type Rng } from '../rng/index.ts';

export type { Rng };
export { createRng };

export interface FlavorEnvelope {
  achievableBands: Partial<Record<AxisKey, Band[]>>;
  maxByAxis: Partial<Record<AxisKey, number>>;
  minByAxis: Partial<Record<AxisKey, number>>;
}

function bandForValue(value: number): Band {
  if (value <= 3) return 'low';
  if (value <= 6) return 'mid';
  return 'high';
}

function combos<T>(items: T[], min: number, max: number): T[][] {
  const result: T[][] = [];
  function walk(start: number, picked: T[]): void {
    if (picked.length >= min && picked.length <= max) {
      result.push([...picked]);
    }
    if (picked.length === max) return;
    for (let i = start; i < items.length; i++) {
      picked.push(items[i]!);
      walk(i + 1, picked);
      picked.pop();
    }
  }
  walk(0, []);
  return result;
}

function pickRandomCombo(unlocked: Ingredient[], rng: Rng): Ingredient[] {
  const maxSize = Math.min(6, unlocked.length);
  const minSize = Math.min(3, unlocked.length);
  const size = rng.nextInt(minSize, maxSize);
  const pool = [...unlocked];
  const picked: Ingredient[] = [];
  while (picked.length < size && pool.length > 0) {
    const index = rng.nextInt(0, pool.length - 1);
    picked.push(pool.splice(index, 1)[0]!);
  }
  return picked;
}

export function computeFlavorEnvelope(
  unlockedIds: string[],
  ingredientsById: Map<string, Ingredient>,
  maxExact = 20,
): FlavorEnvelope {
  const unlocked = unlockedIds
    .map((id) => ingredientsById.get(id))
    .filter((item): item is Ingredient => Boolean(item));

  const achievable = Object.fromEntries(AXIS_KEYS.map((axis) => [axis, new Set<Band>()])) as Record<
    AxisKey,
    Set<Band>
  >;
  const maxByAxis = {} as Partial<Record<AxisKey, number>>;
  const minByAxis = {} as Partial<Record<AxisKey, number>>;

  const evaluate = (vectors: FlavorVector[]): void => {
    const dish = aggregateDish(vectors);
    for (const axis of AXIS_KEYS) {
      achievable[axis].add(bandForValue(dish[axis]));
      maxByAxis[axis] = Math.max(maxByAxis[axis] ?? dish[axis], dish[axis]);
      minByAxis[axis] = Math.min(minByAxis[axis] ?? dish[axis], dish[axis]);
    }
  };

  if (unlocked.length <= maxExact) {
    for (const combo of combos(unlocked, 3, Math.min(6, unlocked.length))) {
      evaluate(combo.map((item) => item.flavor));
    }
  } else {
    const rng = createRng(unlocked.length * 9973);
    for (let i = 0; i < 4000; i++) {
      evaluate(pickRandomCombo(unlocked, rng).map((item) => item.flavor));
    }
  }

  const achievableBands: Partial<Record<AxisKey, Band[]>> = {};
  for (const axis of AXIS_KEYS) {
    const bands = [...achievable[axis]];
    if (bands.length > 0) achievableBands[axis] = bands;
  }
  return { achievableBands, maxByAxis, minByAxis };
}

const PHRASES: Record<AxisKey, Partial<Record<Band, string>>> = {
  SW: { high: 'a hint of sweetness', low: 'not sweet at all' },
  SA: { high: 'properly seasoned', mid: 'a touch of salt' },
  SO: { high: 'bright and tangy', mid: 'a touch of acid', low: 'nothing too sharp' },
  BI: { high: 'pleasantly bitter', low: 'nothing too bitter' },
  UM: { high: 'something really savory', mid: 'a little umami depth' },
  HE: { high: 'herbal and fresh' },
  FR: { high: 'fruity notes' },
  EA: { high: 'earthy flavors' },
  SM: { high: 'smoky depth', mid: 'a whisper of char' },
  PU: { high: 'bold and garlicky', low: 'nothing too pungent' },
  NU: { high: 'toasty nutty notes' },
  RI: { high: 'rich and indulgent', mid: 'moderately hearty', low: 'light and clean' },
  LI: { high: 'fresh and refreshing' },
  HT: { high: 'spicy kick', mid: 'gentle warmth', low: 'mild, no heat' },
  CR: { high: 'some crunch', low: 'soft textures only' },
};

function rankedAxes(archetype: Archetype, dish: FlavorVector): AxisKey[] {
  return [...AXIS_KEYS]
    .map((axis) => ({
      axis,
      score: (archetype.primaryAxisWeights[axis] ?? 0.35) * (0.4 + dish[axis] / 10),
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.axis);
}

function buildPhrases(primary: Partial<Record<AxisKey, Band>>): string[] {
  const phrases: string[] = [];
  for (const axis of Object.keys(primary) as AxisKey[]) {
    const band = primary[axis];
    if (!band) continue;
    const phrase = PHRASES[axis][band];
    if (phrase) phrases.push(phrase);
  }
  return phrases.length > 0 ? phrases : ['something balanced and satisfying'];
}

function buildAvoidOptions(
  ranked: AxisKey[],
  primary: Partial<Record<AxisKey, Band>>,
  dish: FlavorVector,
): Partial<Record<AxisKey, boolean>>[] {
  const options: Partial<Record<AxisKey, boolean>>[] = [{}];
  for (const axis of ranked) {
    if (primary[axis]) continue;
    if (dish[axis] > 4 && PHRASES[axis].low) {
      options.push({ [axis]: true });
      break;
    }
  }
  return options;
}

function preferenceFromCombo(
  targetCombo: Ingredient[],
  archetype: Archetype,
  compoundAffinity: Record<string, Record<string, number>>,
  floor: number,
): CustomerPreference | null {
  const dish = aggregateDish(targetCombo.map((item) => item.flavor));
  const ids = targetCombo.map((item) => item.id);
  const ranked = rankedAxes(archetype, dish);

  for (const axisCount of [3, 2, 1]) {
    const axes = ranked.slice(0, axisCount);
    const primary: Partial<Record<AxisKey, Band>> = {};
    for (const axis of axes) {
      primary[axis] = bandForValue(dish[axis]);
    }

    for (const avoid of buildAvoidOptions(ranked, primary, dish)) {
      const preference: CustomerPreference = {
        primary,
        avoid,
        phrases: buildPhrases(primary),
      };
      if (computeMatchStars(dish, preference, ids, compoundAffinity) >= floor) {
        return preference;
      }
    }
  }

  return null;
}

export interface CustomerRequest {
  preference: CustomerPreference;
  witnessIngredientIds: string[];
}

export function generateCustomerRequest(
  archetype: Archetype,
  unlockedIds: string[],
  ingredientsById: Map<string, Ingredient>,
  rng: Rng,
  compoundAffinity: Record<string, Record<string, number>> = {},
): CustomerRequest {
  const unlocked = unlockedIds
    .map((id) => ingredientsById.get(id))
    .filter((item): item is Ingredient => Boolean(item));

  if (unlocked.length === 0) {
    return {
      preference: { primary: { UM: 'mid' }, avoid: {}, phrases: ['something balanced and satisfying'] },
      witnessIngredientIds: [],
    };
  }

  const floor = unlocked.length <= 5 ? 6.5 : unlocked.length <= 12 ? 6.8 : 7.0;

  const candidateCombos =
    unlocked.length <= 20
      ? combos(unlocked, Math.min(3, unlocked.length), Math.min(6, unlocked.length))
      : Array.from({ length: Math.max(8000, unlocked.length * 120) }, () =>
          pickRandomCombo(unlocked, rng),
        );

  for (let i = candidateCombos.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [candidateCombos[i], candidateCombos[j]] = [candidateCombos[j]!, candidateCombos[i]!];
  }

  for (const combo of candidateCombos) {
    const preference = preferenceFromCombo(combo, archetype, compoundAffinity, floor);
    if (preference) {
      return { preference, witnessIngredientIds: combo.map((item) => item.id) };
    }
  }

  throw new Error(
    `Unable to generate satisfiable customer request for unlock set size ${unlocked.length}`,
  );
}

export function generateCustomerPreference(
  archetype: Archetype,
  unlockedIds: string[],
  ingredientsById: Map<string, Ingredient>,
  rng: Rng,
  compoundAffinity: Record<string, Record<string, number>> = {},
): CustomerPreference {
  return generateCustomerRequest(
    archetype,
    unlockedIds,
    ingredientsById,
    rng,
    compoundAffinity,
  ).preference;
}

/** Hard cap on dish evaluations per customer — competent play, not perfect oracle search. */
export const COMPETENT_MATCH_EVAL_CAP = 512;

/** Shortlist size when ranking unlocked ingredients for the current preference. */
export const COMPETENT_MATCH_SHORTLIST_SIZE = 20;

/** Max unlocked count for exhaustive optimal search (unit tests / small sets only). */
export const OPTIMAL_MATCH_EXACT_MAX = 12;

export function findOptimalMatchCombo(
  unlockedIds: string[],
  preference: CustomerPreference,
  ingredientsById: Map<string, Ingredient>,
  compoundAffinity: Record<string, Record<string, number>>,
  maxExact = OPTIMAL_MATCH_EXACT_MAX,
): { score: number; ingredientIds: string[] } {
  const unlocked = unlockedIds
    .map((id) => ingredientsById.get(id))
    .filter((item): item is Ingredient => Boolean(item));

  let bestScore = 0;
  let bestIds: string[] = [];

  const evaluateCombo = (combo: Ingredient[]): void => {
    const dish = aggregateDish(combo.map((item) => item.flavor));
    const ids = combo.map((item) => item.id);
    const score = computeMatchStars(dish, preference, ids, compoundAffinity);
    if (score > bestScore) {
      bestScore = score;
      bestIds = ids;
    }
  };

  if (unlocked.length <= maxExact) {
    for (const combo of combos(unlocked, 3, Math.min(6, unlocked.length))) {
      evaluateCombo(combo);
    }
  } else {
    throw new Error(
      `findOptimalMatchCombo is for small unlock sets only (<= ${maxExact}); got ${unlocked.length}`,
    );
  }

  return { score: bestScore, ingredientIds: bestIds };
}

function scoreIngredientForPreference(
  ingredient: Ingredient,
  preference: CustomerPreference,
): number {
  let score = 0;
  for (const axis of AXIS_KEYS) {
    const value = ingredient.flavor[axis];
    const band = preference.primary[axis];
    if (band === 'high') score += value;
    else if (band === 'mid') score += 5 - Math.abs(value - 5);
    else if (band === 'low') score += Math.max(0, 5 - value);
    if (preference.avoid[axis] && value > 4) score -= 15;
  }
  return score;
}

function buildCompetentShortlist(
  unlocked: Ingredient[],
  preference: CustomerPreference,
): Ingredient[] {
  const picked = new Map<string, Ingredient>();

  const add = (items: Ingredient[]): void => {
    for (const item of items) {
      picked.set(item.id, item);
    }
  };

  const ranked = [...unlocked].sort((a, b) => {
    const diff =
      scoreIngredientForPreference(b, preference) - scoreIngredientForPreference(a, preference);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
  add(ranked.slice(0, COMPETENT_MATCH_SHORTLIST_SIZE));

  for (const axis of Object.keys(preference.primary) as AxisKey[]) {
    const byAxis = [...unlocked].sort((a, b) => {
      const diff = b.flavor[axis] - a.flavor[axis];
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });
    add(byAxis.slice(0, 4));
  }

  for (const axis of AXIS_KEYS) {
    const byAxis = [...unlocked].sort((a, b) => {
      const diff = b.flavor[axis] - a.flavor[axis];
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });
    add(byAxis.slice(0, 2));
  }

  for (const axis of Object.keys(preference.avoid) as AxisKey[]) {
    if (!preference.avoid[axis]) continue;
    const byAxis = [...unlocked].sort((a, b) => {
      const diff = a.flavor[axis] - b.flavor[axis];
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });
    add(byAxis.slice(0, 3));
  }

  const shortlist = [...picked.values()].sort((a, b) => {
    const diff =
      scoreIngredientForPreference(b, preference) - scoreIngredientForPreference(a, preference);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  return shortlist.slice(0, Math.max(3, Math.min(COMPETENT_MATCH_SHORTLIST_SIZE + 10, shortlist.length)));
}

/**
 * Competent-player dish selection: ranks unlocked ingredients by preference fit,
 * then evaluates shortlist combos up to COMPETENT_MATCH_EVAL_CAP. Calibrated for
 * pacing simulation, not perfect-play oracle search. Deterministic for fixed inputs.
 */
export function findBestMatchCombo(
  unlockedIds: string[],
  preference: CustomerPreference,
  ingredientsById: Map<string, Ingredient>,
  compoundAffinity: Record<string, Record<string, number>>,
): { score: number; ingredientIds: string[] } {
  const unlocked = unlockedIds
    .map((id) => ingredientsById.get(id))
    .filter((item): item is Ingredient => Boolean(item));

  if (unlocked.length === 0) {
    return { score: 0, ingredientIds: [] };
  }

  if (unlocked.length <= OPTIMAL_MATCH_EXACT_MAX) {
    return findOptimalMatchCombo(unlockedIds, preference, ingredientsById, compoundAffinity);
  }

  const shortlist = buildCompetentShortlist(unlocked, preference);
  let bestScore = 0;
  let bestIds: string[] = [];
  let evalCount = 0;

  const evaluateCombo = (combo: Ingredient[]): boolean => {
    if (combo.length < 3 || combo.length > 6) return false;
    if (evalCount >= COMPETENT_MATCH_EVAL_CAP) return true;
    evalCount += 1;
    const dish = aggregateDish(combo.map((item) => item.flavor));
    const ids = combo.map((item) => item.id);
    const score = computeMatchStars(dish, preference, ids, compoundAffinity);
    if (score > bestScore) {
      bestScore = score;
      bestIds = ids;
    }
    return false;
  };

  const topExactPool = [...unlocked]
    .sort((a, b) => {
      const diff =
        scoreIngredientForPreference(b, preference) - scoreIngredientForPreference(a, preference);
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    })
    .slice(0, OPTIMAL_MATCH_EXACT_MAX);
  if (topExactPool.length >= 3) {
    const exact = findOptimalMatchCombo(
      topExactPool.map((item) => item.id),
      preference,
      ingredientsById,
      compoundAffinity,
    );
    if (exact.score > bestScore) {
      bestScore = exact.score;
      bestIds = exact.ingredientIds;
    }
  }

  const greedyCombo = (startIndex = 0): Ingredient[] => {
    if (shortlist.length <= 3) return shortlist;
    const picked: Ingredient[] = [shortlist[startIndex] ?? shortlist[0]!];
    while (picked.length < Math.min(6, shortlist.length)) {
      let bestCandidate: Ingredient | null = null;
      let bestCandidateScore = bestScore;
      for (const candidate of shortlist) {
        if (picked.some((item) => item.id === candidate.id)) continue;
        const trial = [...picked, candidate];
        if (trial.length < 3) continue;
        const dish = aggregateDish(trial.map((item) => item.flavor));
        const ids = trial.map((item) => item.id);
        const score = computeMatchStars(dish, preference, ids, compoundAffinity);
        if (score > bestCandidateScore) {
          bestCandidateScore = score;
          bestCandidate = candidate;
        }
      }
      if (!bestCandidate) break;
      picked.push(bestCandidate);
      if (picked.length >= 3 && bestCandidateScore <= bestScore) break;
    }
    return picked.length >= 3 ? picked : shortlist.slice(0, 3);
  };

  const greedyStarts = Math.min(3, shortlist.length);
  for (let start = 0; start < greedyStarts; start++) {
    if (evaluateCombo(greedyCombo(start))) {
      return { score: bestScore, ingredientIds: bestIds };
    }
  }

  const minSize = Math.min(3, shortlist.length);
  const maxSize = Math.min(6, shortlist.length);
  outer: for (let size = minSize; size <= maxSize; size++) {
    for (const combo of combos(shortlist, size, size)) {
      if (evaluateCombo(combo)) break outer;
    }
  }

  return { score: bestScore, ingredientIds: bestIds };
}
