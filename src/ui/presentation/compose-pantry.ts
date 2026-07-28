import { AXIS_LABELS } from '../../domain/flavor/axis-labels.ts';
import type { AxisKey, Ingredient } from '../../domain/types.ts';
import { filterIngredientsByAxis } from './flavor-profile.ts';

export const COMPOSE_AXIS_HIGH_MIN = 4;

export interface ComposePantryFilterState {
  selectedAxes: AxisKey[];
  nameQuery: string;
}

export function emptyComposePantryFilters(): ComposePantryFilterState {
  return { selectedAxes: [], nameQuery: '' };
}

export function toggleComposeAxis(
  state: ComposePantryFilterState,
  axis: AxisKey,
): ComposePantryFilterState {
  const selectedAxes = state.selectedAxes.includes(axis)
    ? state.selectedAxes.filter((selected) => selected !== axis)
    : [...state.selectedAxes, axis];
  return { ...state, selectedAxes };
}

export function clearComposeAxes(
  state: ComposePantryFilterState,
): ComposePantryFilterState {
  return { ...state, selectedAxes: [] };
}

export function setComposeNameQuery(
  state: ComposePantryFilterState,
  nameQuery: string,
): ComposePantryFilterState {
  return { ...state, nameQuery };
}

export function clearComposeNameQuery(
  state: ComposePantryFilterState,
): ComposePantryFilterState {
  return { ...state, nameQuery: '' };
}

export function filterComposePantry(
  unlocked: Ingredient[],
  filters: ComposePantryFilterState,
): Ingredient[] {
  let matches = unlocked;
  for (const axis of filters.selectedAxes) {
    matches = filterIngredientsByAxis(matches, axis, COMPOSE_AXIS_HIGH_MIN);
  }

  const query = filters.nameQuery.trim().toLocaleLowerCase('en-US');
  if (query) {
    matches = matches.filter((ingredient) =>
      ingredient.name.toLocaleLowerCase('en-US').includes(query),
    );
  }

  return [...matches].sort((left, right) =>
    left.name.localeCompare(right.name, 'en-US'),
  );
}

export function composePantrySummary(
  filters: ComposePantryFilterState,
  matchCount: number,
): string {
  const count = `${matchCount} matching`;
  if (filters.selectedAxes.length === 0) return count;
  return `${count} · ${filters.selectedAxes
    .map((axis) => AXIS_LABELS[axis])
    .join(' + ')}`;
}
