import type { AxisKey, Band, CustomerPreference, FlavorVector } from '../types.ts';
import { AXIS_KEYS } from '../types.ts';

function axisSatisfaction(
  dish: FlavorVector,
  axis: AxisKey,
  band: Band | undefined,
  avoid: boolean,
): number {
  if (avoid && dish[axis] > 4) return 0;
  if (!band) return 0.7;
  if (band === 'high') return Math.min(1, Math.max(0, dish[axis] / 10));
  if (band === 'mid') return 1 - Math.abs(dish[axis] - 5) / 3;
  return 1 - Math.min(1, Math.max(0, dish[axis] / 4));
}

export function computeWeightedSatisfaction(
  dish: FlavorVector,
  preference: CustomerPreference,
): number {
  const primaryAxes = Object.keys(preference.primary) as AxisKey[];
  const avoidOnlyAxes = AXIS_KEYS.filter(
    (axis) => preference.avoid[axis] && !preference.primary[axis],
  );

  if (primaryAxes.length === 0 && avoidOnlyAxes.length === 0) {
    return 0.5;
  }

  let primarySum = 0;
  for (const axis of primaryAxes) {
    primarySum += axisSatisfaction(
      dish,
      axis,
      preference.primary[axis],
      Boolean(preference.avoid[axis]),
    );
  }

  const avoidViolations = AXIS_KEYS.filter(
    (axis) => preference.avoid[axis] && dish[axis] > 4,
  ).length;

  if (primaryAxes.length === 0) {
    const penalty = 5 * avoidViolations;
    return Math.max(0, 0.5 - penalty / Math.max(1, avoidOnlyAxes.length));
  }

  const numerator = 2 * primarySum - 5 * avoidViolations;
  const denominator = 2 * primaryAxes.length;
  return numerator / denominator;
}

export function meanPairAffinity(
  ingredientIds: string[],
  matrix: Record<string, Record<string, number>>,
): number {
  if (ingredientIds.length < 2) return 0;
  let total = 0;
  let count = 0;
  for (let i = 0; i < ingredientIds.length; i++) {
    for (let j = i + 1; j < ingredientIds.length; j++) {
      total += matrix[ingredientIds[i]!]?.[ingredientIds[j]!] ?? 0;
      count++;
    }
  }
  return count === 0 ? 0 : total / count;
}

export function computeMatchStars(
  dish: FlavorVector,
  preference: CustomerPreference,
  ingredientIds: string[],
  compoundAffinity: Record<string, Record<string, number>>,
  recipeBonus = 0,
): number {
  const weightedSat = computeWeightedSatisfaction(dish, preference);
  const affinityBonus = meanPairAffinity(ingredientIds, compoundAffinity);
  const raw = 10 * (0.85 * weightedSat + 0.15 * affinityBonus) + recipeBonus;
  return Math.min(10, Math.max(0, raw));
}
