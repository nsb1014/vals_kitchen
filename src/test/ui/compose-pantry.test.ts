import { describe, expect, it } from 'vitest';
import { emptyFlavorProfile } from '../../domain/flavor/axis-labels.ts';
import type { Ingredient } from '../../domain/types.ts';
import {
  composePantrySummary,
  emptyComposePantryFilters,
  filterComposePantry,
  toggleComposeAxis,
} from '../../ui/presentation/compose-pantry.ts';

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
  ingredient('stock', 'Alpha Stock', { UM: 8, HT: 7, RI: 2 }),
  ingredient('oil', 'Beta Oil', { UM: 8, HT: 0, RI: 9 }),
  ingredient('chili', 'Chili Flake', { UM: 0, HT: 9, RI: 4 }),
  ingredient('herb', 'Fresh Herb', { UM: 2, HT: 1, RI: 0 }),
];

describe('compose pantry filters', () => {
  it('keeps only the most recently selected flavor axis', () => {
    let filters = toggleComposeAxis(emptyComposePantryFilters(), 'UM');
    filters = toggleComposeAxis(filters, 'HT');
    expect(filters.selectedAxis).toBe('HT');
    expect(filterComposePantry(pantry, filters).map((item) => item.id)).toEqual(
      ['chili', 'stock'],
    );
  });

  it('clears the active flavor when it is selected again', () => {
    let filters = toggleComposeAxis(emptyComposePantryFilters(), 'UM');
    filters = toggleComposeAxis(filters, 'UM');
    expect(filters.selectedAxis).toBeNull();
    expect(filterComposePantry(pantry, filters)).toHaveLength(4);
  });

  it('summarizes the result count and active axes', () => {
    const filters = toggleComposeAxis(emptyComposePantryFilters(), 'UM');
    expect(composePantrySummary(filters, 2)).toBe('2 matching · Umami');
  });

  it('uses the requested band when an order flavor pill is selected', () => {
    const umami = toggleComposeAxis(emptyComposePantryFilters(), 'UM');
    expect(
      filterComposePantry(pantry, umami, { UM: 'high' }).map((item) => item.id),
    ).toEqual(['stock', 'oil']);
    expect(
      filterComposePantry(pantry, umami, { UM: 'low' }).map((item) => item.id),
    ).toEqual(['chili', 'herb']);

    const heat = toggleComposeAxis(emptyComposePantryFilters(), 'HT');
    expect(
      filterComposePantry(pantry, heat, { HT: 'mid' }).map((item) => item.id),
    ).toEqual(['chili', 'stock', 'herb', 'oil']);
    expect(composePantrySummary(heat, 4, { HT: 'mid' })).toBe(
      '4 matching · Moderate Heat',
    );
  });

  it('keeps high and low ingredients on a moderate filter so they can mix', () => {
    const rich = toggleComposeAxis(emptyComposePantryFilters(), 'RI');
    expect(
      filterComposePantry(pantry, rich, { RI: 'mid' }).map((item) => item.id),
    ).toEqual(['oil', 'chili', 'stock', 'herb']);
  });

  it('sorts a low filter from least of that flavor to most', () => {
    const umami = toggleComposeAxis(emptyComposePantryFilters(), 'UM');
    expect(
      filterComposePantry(pantry, umami, { UM: 'low' }).map((item) => item.id),
    ).toEqual(['chili', 'herb']);
  });

  it('sorts a high filter from most of that flavor to least', () => {
    const heat = toggleComposeAxis(emptyComposePantryFilters(), 'HT');
    expect(
      filterComposePantry(pantry, heat, { HT: 'high' }).map((item) => item.id),
    ).toEqual(['chili', 'stock']);
  });
});
