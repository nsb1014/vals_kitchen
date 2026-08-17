import { AXIS_LABELS } from '../../domain/flavor/axis-labels.ts';
import type { AxisKey, Band, Ingredient } from '../../domain/types.ts';

export const COMPOSE_AXIS_HIGH_MIN = 4;
export const COMPOSE_LOW_MATCH_THRESHOLD = 5;
export type ComposeAxisBands = Partial<Record<AxisKey, Band>>;

export interface ComposePantryFilterState {
  selectedAxis: AxisKey | null;
  searchQuery: string;
}

export function emptyComposePantryFilters(): ComposePantryFilterState {
  return { selectedAxis: null, searchQuery: '' };
}

export function toggleComposeAxis(
  state: ComposePantryFilterState,
  axis: AxisKey,
): ComposePantryFilterState {
  return {
    ...state,
    selectedAxis: state.selectedAxis === axis ? null : axis,
  };
}

export function clearComposeAxisFilter(
  state: ComposePantryFilterState,
): ComposePantryFilterState {
  return { ...state, selectedAxis: null };
}

export function setComposeSearchQuery(
  state: ComposePantryFilterState,
  searchQuery: string,
): ComposePantryFilterState {
  return { ...state, searchQuery };
}

export function filterComposePantry(
  unlocked: Ingredient[],
  filters: ComposePantryFilterState,
  requestedBands: ComposeAxisBands = {},
): Ingredient[] {
  const axis = filters.selectedAxis;
  const band = axis ? requestedBands[axis] : undefined;
  let matches = axis
    ? unlocked.filter((ingredient) => {
        const value = ingredient.flavor[axis];
        if (band === 'low') return value <= 3;
        // Moderate dishes are mixed: a high-rich item plus a low-rich item
        // can land in the mid band, so do not hide either contributor.
        if (band === 'mid') return true;
        if (band === 'high') return value >= 6;
        return value >= COMPOSE_AXIS_HIGH_MIN;
      })
    : unlocked;

  const query = filters.searchQuery.trim().toLowerCase();
  if (query) {
    matches = matches.filter((ingredient) =>
      ingredient.name.toLowerCase().includes(query),
    );
  }

  if (!axis) {
    return [...matches].sort((left, right) =>
      left.name.localeCompare(right.name, 'en-US'),
    );
  }

  const descending = band !== 'low';
  return [...matches].sort((left, right) => {
    const delta = left.flavor[axis] - right.flavor[axis];
    if (delta !== 0) return descending ? -delta : delta;
    return left.name.localeCompare(right.name, 'en-US');
  });
}

export function composePantrySummary(
  filters: ComposePantryFilterState,
  matchCount: number,
  requestedBands: ComposeAxisBands = {},
): string {
  const count = `${matchCount} matching`;
  const parts: string[] = [count];
  if (filters.selectedAxis) {
    const band = requestedBands[filters.selectedAxis];
    const label = band
      ? `${bandLabel(band)} ${AXIS_LABELS[filters.selectedAxis]}`
      : AXIS_LABELS[filters.selectedAxis];
    parts.push(label);
  }
  const query = filters.searchQuery.trim();
  if (query) parts.push(`“${query}”`);
  return parts.join(' · ');
}

/** Hint when axis/search filters leave a near-empty pantry. */
export function composePantryLowMatchHint(
  matchCount: number,
  filters: ComposePantryFilterState,
): string | null {
  const hasFilter =
    filters.selectedAxis !== null || filters.searchQuery.trim().length > 0;
  if (!hasFilter || matchCount >= COMPOSE_LOW_MATCH_THRESHOLD) return null;
  if (matchCount === 0) {
    return 'No matches — tap All ingredients or clear search';
  }
  return 'Few matches — tap All ingredients or clear search';
}

export function bandLabel(band: Band): string {
  if (band === 'mid') return 'Moderate';
  return band === 'high' ? 'High' : 'Low';
}
