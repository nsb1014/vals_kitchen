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

/** Per-axis presence in the player's unlocked ingredient list (not dish envelope alone). */
export interface UnlockedFlavorProfile {
  ingredientMax: Partial<Record<AxisKey, number>>;
  ingredientMin: Partial<Record<AxisKey, number>>;
  ingredientVariance: Partial<Record<AxisKey, number>>;
  /** Axes that both appear strongly on unlocked ingredients and steer dish scores. */
  actionableAxes: AxisKey[];
}

const MIN_INGREDIENT_AXIS_VARIANCE = 1;
const MIN_INGREDIENT_AXIS_PEAK = 3.5;
/** Minimum dish spread on an axis for it to steer ingredient choice (not flavor-noise). */
const MIN_ACTIONABLE_AXIS_SPREAD = 2.5;
/** Minimum primary cues shown to the player early game. */
const MIN_PRIMARY_CUE_COUNT = 2;
/** Max satisfiable witness combos considered before picking one at random. */
const REQUEST_CANDIDATE_CAP = 24;

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

export function computeUnlockedFlavorProfile(
  unlocked: Ingredient[],
  envelope: FlavorEnvelope,
): UnlockedFlavorProfile {
  const ingredientMax = {} as Partial<Record<AxisKey, number>>;
  const ingredientMin = {} as Partial<Record<AxisKey, number>>;
  const ingredientVariance = {} as Partial<Record<AxisKey, number>>;

  for (const axis of AXIS_KEYS) {
    const values = unlocked.map((item) => item.flavor[axis]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    ingredientMax[axis] = Math.max(...values);
    ingredientMin[axis] = Math.min(...values);
    ingredientVariance[axis] =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  }

  const actionableAxes = AXIS_KEYS.filter((axis) => {
    const variance = ingredientVariance[axis] ?? 0;
    const peak = ingredientMax[axis] ?? 0;
    const spread = (envelope.maxByAxis[axis] ?? 0) - (envelope.minByAxis[axis] ?? 0);
    const bandCount = envelope.achievableBands[axis]?.length ?? 0;
    return (
      variance >= MIN_INGREDIENT_AXIS_VARIANCE &&
      peak >= MIN_INGREDIENT_AXIS_PEAK &&
      (spread >= MIN_ACTIONABLE_AXIS_SPREAD || bandCount >= 2)
    );
  });

  return { ingredientMax, ingredientMin, ingredientVariance, actionableAxes };
}

function preferenceUsesActionableAxes(
  preference: CustomerPreference,
  profile: UnlockedFlavorProfile,
): boolean {
  const allowed = new Set(profile.actionableAxes);
  for (const axis of Object.keys(preference.primary) as AxisKey[]) {
    if (!allowed.has(axis)) return false;
  }
  for (const axis of Object.keys(preference.avoid) as AxisKey[]) {
    if (preference.avoid[axis] && !allowed.has(axis)) return false;
  }
  return true;
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

function rankedActionableAxes(
  archetype: Archetype,
  dish: FlavorVector,
  envelope: FlavorEnvelope,
  profile: UnlockedFlavorProfile,
): AxisKey[] {
  const fallbackAxes: AxisKey[] = ['UM', 'PU', 'SA', 'RI'];
  const pool: AxisKey[] =
    profile.actionableAxes.length >= MIN_PRIMARY_CUE_COUNT
      ? profile.actionableAxes
      : [...profile.actionableAxes, ...fallbackAxes].filter(
          (axis, index, list) => list.indexOf(axis) === index,
        );

  return pool
    .map((axis) => ({
      axis,
      score:
        (archetype.primaryAxisWeights[axis] ?? 0.35) *
        (0.4 + dish[axis] / 10) *
        ((envelope.maxByAxis[axis] ?? 0) - (envelope.minByAxis[axis] ?? 0) + 1) *
        ((profile.ingredientVariance[axis] ?? 0) + 1),
    }))
    .sort((a, b) => b.score - a.score || a.axis.localeCompare(b.axis))
    .map((entry) => entry.axis);
}

function buildPhrases(
  primary: Partial<Record<AxisKey, Band>>,
  avoid: Partial<Record<AxisKey, boolean>> = {},
): string[] {
  const phrases: string[] = [];
  for (const axis of Object.keys(primary) as AxisKey[]) {
    const band = primary[axis];
    if (!band) continue;
    const phrase = PHRASES[axis][band];
    if (phrase) phrases.push(phrase);
  }
  for (const axis of Object.keys(avoid) as AxisKey[]) {
    if (!avoid[axis] || primary[axis]) continue;
    const phrase = PHRASES[axis].low;
    if (phrase) phrases.push(phrase);
  }
  return phrases.length > 0 ? phrases : ['something balanced and satisfying'];
}

function primaryCueCount(preference: CustomerPreference): number {
  return Object.keys(preference.primary).length;
}

function buildAvoidOptions(
  ranked: AxisKey[],
  primary: Partial<Record<AxisKey, Band>>,
  dish: FlavorVector,
  profile: UnlockedFlavorProfile,
): Partial<Record<AxisKey, boolean>>[] {
  const options: Partial<Record<AxisKey, boolean>>[] = [{}];
  for (const axis of ranked) {
    if (primary[axis]) continue;
    if (!profile.actionableAxes.includes(axis)) continue;
    const canViolate = (profile.ingredientMax[axis] ?? 0) >= 5;
    if (canViolate && dish[axis] <= 3 && PHRASES[axis].low) {
      options.push({ [axis]: true });
    }
  }
  return options;
}

function preferenceAxisWindows(ranked: AxisKey[], axisCount: number): AxisKey[][] {
  const windows: AxisKey[][] = [];
  for (let offset = 0; offset <= ranked.length - axisCount; offset++) {
    windows.push(ranked.slice(offset, offset + axisCount));
  }
  if (windows.length === 0 && ranked.length >= axisCount) {
    windows.push(ranked.slice(0, axisCount));
  }
  return windows;
}

function preferenceFromCombo(
  targetCombo: Ingredient[],
  archetype: Archetype,
  compoundAffinity: Record<string, Record<string, number>>,
  floor: number,
  envelope: FlavorEnvelope,
  profile: UnlockedFlavorProfile,
): CustomerPreference | null {
  const dish = aggregateDish(targetCombo.map((item) => item.flavor));
  const ids = targetCombo.map((item) => item.id);
  const ranked = rankedActionableAxes(archetype, dish, envelope, profile);
  if (ranked.length < MIN_PRIMARY_CUE_COUNT) return null;

  for (const axisCount of [3, 2]) {
    if (ranked.length < axisCount) continue;
    for (const axes of preferenceAxisWindows(ranked, axisCount)) {
      const primary: Partial<Record<AxisKey, Band>> = {};
      for (const axis of axes) {
        primary[axis] = bandForValue(dish[axis]);
      }

      for (const avoid of buildAvoidOptions(ranked, primary, dish, profile)) {
        const preference: CustomerPreference = {
          primary,
          avoid,
          phrases: buildPhrases(primary, avoid),
        };
        if (
          primaryCueCount(preference) >= MIN_PRIMARY_CUE_COUNT &&
          preferenceUsesActionableAxes(preference, profile) &&
          computeMatchStars(dish, preference, ids, compoundAffinity) >= floor
        ) {
          return preference;
        }
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
  const envelope = computeFlavorEnvelope(unlockedIds, ingredientsById);
  const profile = computeUnlockedFlavorProfile(unlocked, envelope);

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

  const richCandidates: CustomerRequest[] = [];
  const fallbackCandidates: CustomerRequest[] = [];

  for (const combo of candidateCombos) {
    const preference = preferenceFromCombo(
      combo,
      archetype,
      compoundAffinity,
      floor,
      envelope,
      profile,
    );
    if (!preference) continue;
    const request: CustomerRequest = {
      preference,
      witnessIngredientIds: combo.map((item) => item.id),
    };
    if (primaryCueCount(preference) >= MIN_PRIMARY_CUE_COUNT && preference.phrases.length >= 2) {
      richCandidates.push(request);
      if (richCandidates.length >= REQUEST_CANDIDATE_CAP) break;
    } else {
      fallbackCandidates.push(request);
    }
  }

  const pool =
    richCandidates.length > 0
      ? richCandidates
      : fallbackCandidates.length > 0
        ? fallbackCandidates
        : null;
  if (pool) {
    return pool[rng.nextInt(0, pool.length - 1)]!;
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
