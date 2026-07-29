import { AXIS_LABELS } from '../../domain/flavor/axis-labels.ts';
import type { AxisKey, Band, Ingredient } from '../../domain/types.ts';

export const COMPOSE_AXIS_HIGH_MIN = 4;
export type ComposeAxisBands = Partial<Record<AxisKey, Band>>;

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
  requestedBands: ComposeAxisBands = {},
): Ingredient[] {
  let matches = unlocked;
  for (const axis of filters.selectedAxes) {
    const band = requestedBands[axis];
    matches = matches.filter((ingredient) => {
      const value = ingredient.flavor[axis];
      if (band === 'low') return value <= 3;
      if (band === 'mid') return value >= 3 && value <= 7;
      if (band === 'high') return value >= 6;
      return value >= COMPOSE_AXIS_HIGH_MIN;
    });
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
  requestedBands: ComposeAxisBands = {},
): string {
  const count = `${matchCount} matching`;
  if (filters.selectedAxes.length === 0) return count;
  return `${count} · ${filters.selectedAxes
    .map((axis) => {
      const band = requestedBands[axis];
      return band ? `${bandLabel(band)} ${AXIS_LABELS[axis]}` : AXIS_LABELS[axis];
    })
    .join(' + ')}`;
}

export function bandLabel(band: Band): string {
  if (band === 'mid') return 'Moderate';
  return band === 'high' ? 'High' : 'Low';
}
