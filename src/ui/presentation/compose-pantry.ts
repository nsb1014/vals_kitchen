import { AXIS_LABELS } from '../../domain/flavor/axis-labels.ts';
import type { AxisKey, Band, Ingredient } from '../../domain/types.ts';

export const COMPOSE_AXIS_HIGH_MIN = 4;
export type ComposeAxisBands = Partial<Record<AxisKey, Band>>;

export interface ComposePantryFilterState {
  selectedAxis: AxisKey | null;
}

export function emptyComposePantryFilters(): ComposePantryFilterState {
  return { selectedAxis: null };
}

export function toggleComposeAxis(
  state: ComposePantryFilterState,
  axis: AxisKey,
): ComposePantryFilterState {
  return { selectedAxis: state.selectedAxis === axis ? null : axis };
}

export function filterComposePantry(
  unlocked: Ingredient[],
  filters: ComposePantryFilterState,
  requestedBands: ComposeAxisBands = {},
): Ingredient[] {
  const axis = filters.selectedAxis;
  const matches = axis
    ? unlocked.filter((ingredient) => {
        const band = requestedBands[axis];
        const value = ingredient.flavor[axis];
        if (band === 'low') return value <= 3;
        if (band === 'mid') return value >= 3 && value <= 7;
        if (band === 'high') return value >= 6;
        return value >= COMPOSE_AXIS_HIGH_MIN;
      })
    : unlocked;

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
  if (!filters.selectedAxis) return count;
  const band = requestedBands[filters.selectedAxis];
  const label = band
    ? `${bandLabel(band)} ${AXIS_LABELS[filters.selectedAxis]}`
    : AXIS_LABELS[filters.selectedAxis];
  return `${count} · ${label}`;
}

export function bandLabel(band: Band): string {
  if (band === 'mid') return 'Moderate';
  return band === 'high' ? 'High' : 'Low';
}
