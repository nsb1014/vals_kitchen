import { describe, expect, it } from 'vitest';
import { emptyFlavorProfile } from '../domain/flavor/axis-labels.ts';
import type { Ingredient } from '../domain/types.ts';
import {
  clearComposeAxisFilter,
  composePantryLowMatchHint,
  composePantrySummary,
  emptyComposePantryFilters,
  filterComposePantry,
  setComposeSearchQuery,
  toggleComposeAxis,
} from '../ui/presentation/compose-pantry.ts';
import {
  formatRequestBandStatus,
  requestBandDelta,
  requestBandRange,
  requestBandShadePercents,
} from '../ui/presentation/compose-request.ts';
import { splitCustomerRequestPhrases } from '../ui/presentation/customer-request.ts';

function ingredient(
  id: string,
  name: string,
  flavor: Partial<Ingredient['flavor']>,
): Ingredient {
  return {
    id,
    name,
    category: 'test',
    equipmentId: 'prep_station',
    flavor: { ...emptyFlavorProfile(), ...flavor },
    compoundIds: [],
    purchaseIndex: 0,
  };
}

const pantry = [
  ingredient('stock', 'Alpha Stock', { UM: 8, HT: 7, SA: 1 }),
  ingredient('oil', 'Beta Oil', { UM: 8, HT: 0, SA: 2 }),
  ingredient('chili', 'Chili Flake', { UM: 0, HT: 9, SA: 8 }),
  ingredient('salt', 'Sea Salt', { UM: 1, HT: 0, SA: 9 }),
];

describe('cooking pantry search', () => {
  it('filters by case-insensitive name substring after axis filter', () => {
    let filters = toggleComposeAxis(emptyComposePantryFilters(), 'UM');
    filters = setComposeSearchQuery(filters, 'oil');
    expect(
      filterComposePantry(pantry, filters, { UM: 'high' }).map((item) => item.id),
    ).toEqual(['oil']);
  });

  it('preserves search when toggling axes and clears axis via All', () => {
    let filters = setComposeSearchQuery(emptyComposePantryFilters(), 'Salt');
    filters = toggleComposeAxis(filters, 'SA');
    expect(filters.searchQuery).toBe('Salt');
    expect(filterComposePantry(pantry, filters).map((item) => item.id)).toEqual(
      ['salt'],
    );
    filters = clearComposeAxisFilter(filters);
    expect(filters.selectedAxis).toBeNull();
    expect(filterComposePantry(pantry, filters).map((item) => item.id)).toEqual(
      ['salt'],
    );
  });

  it('summarizes search and surfaces low-match recovery hints', () => {
    const filters = setComposeSearchQuery(
      toggleComposeAxis(emptyComposePantryFilters(), 'SA'),
      'sea',
    );
    expect(composePantrySummary(filters, 1, { SA: 'high' })).toBe(
      '1 matching · High Salty · “sea”',
    );
    expect(composePantryLowMatchHint(1, filters)).toMatch(/Few matches/i);
    expect(composePantryLowMatchHint(0, filters)).toMatch(/No matches/i);
    expect(
      composePantryLowMatchHint(5, filters),
    ).toBeNull();
    expect(
      composePantryLowMatchHint(1, emptyComposePantryFilters()),
    ).toBeNull();
  });
});

describe('cooking request meters', () => {
  it('shades band ranges and reports signed deltas outside range', () => {
    expect(requestBandRange('low')).toEqual({ min: 0, max: 3 });
    expect(requestBandShadePercents('mid')).toEqual({
      leftPct: 30,
      widthPct: 40,
    });
    expect(requestBandDelta(4.8, 'high')).toBe(1.2);
    expect(requestBandDelta(8.5, 'mid')).toBe(1.5);
    expect(formatRequestBandStatus(4.8, 'high')).toEqual({
      position: 'below',
      label: 'Below request',
      deltaText: '+1.2',
    });
    expect(formatRequestBandStatus(7, 'mid').deltaText).toBeNull();
  });
});

describe('cooking order phrase chips', () => {
  it('splits preference phrases for Order-tab scan chips', () => {
    expect(
      splitCustomerRequestPhrases({
        primary: {},
        avoid: {},
        phrases: ['high Umami', 'low Salty'],
      }),
    ).toEqual(['High Umami', 'Low Salty']);
  });
});
