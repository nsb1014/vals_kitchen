import type { AxisKey, FlavorVector } from '../types.ts';
import { AXIS_KEYS } from '../types.ts';

const TASTE_ALPHA = 0.25;
const AROMA_ALPHA = 0.4;
const HEAT_ALPHA = 0.55;
const AROMA_KEYS: AxisKey[] = ['HE', 'FR', 'EA', 'SM', 'PU', 'NU'];

function alphaFor(axis: AxisKey): number {
  if (axis === 'HT') return HEAT_ALPHA;
  if (AROMA_KEYS.includes(axis)) return AROMA_ALPHA;
  return TASTE_ALPHA;
}

export function aggregateDish(ingredients: FlavorVector[]): FlavorVector {
  if (ingredients.length === 0) {
    throw new Error('aggregateDish requires at least one ingredient');
  }

  const result = {} as FlavorVector;
  for (const axis of AXIS_KEYS) {
    const alpha = alphaFor(axis);
    const values = ingredients.map((item) => item[axis]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const max = Math.max(...values);
    result[axis] = (1 - alpha) * mean + alpha * max;
  }

  const teCounts = new Map<-1 | 0 | 1, number>();
  for (const ingredient of ingredients) {
    teCounts.set(ingredient.TE, (teCounts.get(ingredient.TE) ?? 0) + 1);
  }
  let bestTe: -1 | 0 | 1 = 1;
  let bestCount = -1;
  for (const te of [1, 0, -1] as const) {
    const count = teCounts.get(te) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestTe = te;
    }
  }
  result.TE = bestTe;
  return result;
}
