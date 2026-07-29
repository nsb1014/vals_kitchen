import type { Band, CustomerPreference, FlavorVector } from '../types.ts';
import { AXIS_KEYS } from '../types.ts';

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Satisfaction for the same bands used by request generation:
 * low <= 3, moderate 3–6, high >= 6. Values just outside a band taper
 * smoothly, but a satisfaction component can never become negative.
 */
export function bandSatisfaction(value: number, band: Band): number {
  const clamped = Math.min(10, Math.max(0, value));
  if (band === 'low') {
    return clamped <= 3 ? 1 : clampUnit((7 - clamped) / 4);
  }
  if (band === 'mid') {
    if (clamped >= 3 && clamped <= 7) return 1;
    return clamped < 3
      ? clampUnit(clamped / 3)
      : clampUnit((10 - clamped) / 3);
  }
  return clamped >= 6 ? 1 : clampUnit((clamped - 3) / 3);
}

export function computeWeightedSatisfaction(
  dish: FlavorVector,
  preference: CustomerPreference,
): number {
  const scoredAxes = AXIS_KEYS.filter(
    (axis) => Boolean(preference.primary[axis]) || Boolean(preference.avoid[axis]),
  );

  if (scoredAxes.length === 0) {
    return 0.5;
  }

  let satisfactionSum = 0;
  for (const axis of scoredAxes) {
    const band = preference.primary[axis];
    let satisfaction = band ? bandSatisfaction(dish[axis], band) : 1;
    if (preference.avoid[axis]) {
      satisfaction = Math.min(
        satisfaction,
        bandSatisfaction(dish[axis], 'low'),
      );
    }
    satisfactionSum += satisfaction;
  }

  return satisfactionSum / scoredAxes.length;
}

/**
 * Rewards proximity to the generated achievable target without making that
 * exact vector the only acceptable answer. A five-point average miss exhausts
 * the bonus; old saves without an ideal profile keep neutral full closeness.
 */
export function computeIdealCloseness(
  dish: FlavorVector,
  preference: CustomerPreference,
): number {
  if (!preference.idealProfile) return 1;
  const scoredAxes = AXIS_KEYS.filter(
    (axis) => Boolean(preference.primary[axis]) || Boolean(preference.avoid[axis]),
  );
  if (scoredAxes.length === 0) return 1;

  const meanDistance =
    scoredAxes.reduce(
      (sum, axis) =>
        sum + Math.abs(dish[axis] - preference.idealProfile![axis]),
      0,
    ) / scoredAxes.length;
  return clampUnit(1 - meanDistance / 5);
}

/**
 * The visible request result: broad flavor bands remain the main requirement,
 * while one-sixth of the request score distinguishes the achievable ideal.
 */
export function computeRequestSatisfaction(
  dish: FlavorVector,
  preference: CustomerPreference,
): number {
  return (
    (5 / 6) * computeWeightedSatisfaction(dish, preference) +
    (1 / 6) * computeIdealCloseness(dish, preference)
  );
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
  const requestSatisfaction = computeRequestSatisfaction(dish, preference);
  const affinityBonus = meanPairAffinity(ingredientIds, compoundAffinity);
  // The request remains 90% of the result; ingredient affinity is a smaller bonus.
  const raw =
    10 * (0.9 * requestSatisfaction + 0.1 * affinityBonus) + recipeBonus;
  return Math.min(10, Math.max(0, raw));
}
