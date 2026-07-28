import { aggregateDish } from '../../domain/flavor/aggregate.ts';
import { AXIS_LABELS } from '../../domain/flavor/axis-labels.ts';
import type { AxisKey, FlavorVector, Ingredient } from '../../domain/types.ts';
import { AXIS_KEYS } from '../../domain/types.ts';
import {
  MAX_DISH_INGREDIENTS,
  MIN_DISH_INGREDIENTS,
} from '../../domain/state/game-state.ts';

export interface DishPreview {
  ingredientCount: number;
  isValidCount: boolean;
  profile: FlavorVector | null;
  topAxes: Array<{ axis: AxisKey; label: string; value: number }>;
  temperatureLabel: string;
}

export function temperatureLabel(te: -1 | 0 | 1): string {
  if (te === -1) return 'Cold';
  if (te === 1) return 'Hot';
  return 'Neutral';
}

export function computeDishPreview(
  ingredientIds: string[],
  ingredientsById: Map<string, Ingredient>,
): DishPreview {
  const isValidCount =
    ingredientIds.length >= MIN_DISH_INGREDIENTS &&
    ingredientIds.length <= MAX_DISH_INGREDIENTS;

  if (ingredientIds.length === 0) {
    return {
      ingredientCount: 0,
      isValidCount: false,
      profile: null,
      topAxes: [],
      temperatureLabel: '—',
    };
  }

  const flavors: FlavorVector[] = [];
  for (const id of ingredientIds) {
    const item = ingredientsById.get(id);
    if (item) flavors.push(item.flavor);
  }

  if (flavors.length === 0) {
    return {
      ingredientCount: ingredientIds.length,
      isValidCount: false,
      profile: null,
      topAxes: [],
      temperatureLabel: '—',
    };
  }

  const profile = aggregateDish(flavors);
  const topAxes = [...AXIS_KEYS]
    .map((axis) => ({ axis, label: AXIS_LABELS[axis], value: profile[axis] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);

  return {
    ingredientCount: ingredientIds.length,
    isValidCount,
    profile,
    topAxes,
    temperatureLabel: temperatureLabel(profile.TE),
  };
}

export function canToggleIngredient(
  ingredientId: string,
  selectedIds: string[],
): { allowed: boolean; nextIds: string[] } {
  const index = selectedIds.indexOf(ingredientId);
  if (index >= 0) {
    return { allowed: true, nextIds: selectedIds.filter((id) => id !== ingredientId) };
  }
  if (selectedIds.length >= MAX_DISH_INGREDIENTS) {
    return { allowed: false, nextIds: selectedIds };
  }
  return { allowed: true, nextIds: [...selectedIds, ingredientId] };
}
