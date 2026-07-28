import { describe, expect, it } from 'vitest';
import type { FlavorVector } from '../../domain/types.ts';
import { AXIS_KEYS } from '../../domain/types.ts';
import {
  buildFlavorBarsViewModel,
  buildFlavorProfileViewModel,
  filterIngredientsByAxis,
  flavorBarWidthPercent,
  renderFlavorBarsHtml,
  sortIngredientsByAxis,
} from '../../ui/presentation/flavor-profile.ts';
import { testContext } from '../test-helpers.ts';

function zeroFlavor(): FlavorVector {
  const profile = { TE: 0 as const } as FlavorVector;
  for (const key of AXIS_KEYS) {
    profile[key] = 0;
  }
  return profile;
}

describe('flavor profile presentation', () => {
  it('builds 16-axis view model with groups and equipment gate', () => {
    const ingredient = testContext.ingredientsById.get('chicken')!;
    const model = buildFlavorProfileViewModel(
      ingredient,
      new Map([['prep_station', 'Prep Station']]),
    );

    expect(model.axes).toHaveLength(15);
    expect(model.temperature.label).toBeTruthy();
    expect(model.equipmentGateLabel).toBe('Prep Station');
    expect(model.axes.filter((row) => row.group === 'taste')).toHaveLength(5);
    expect(model.axes.filter((row) => row.group === 'aroma')).toHaveLength(6);
    expect(model.axes.filter((row) => row.group === 'mouthfeel')).toHaveLength(4);
  });

  it('filters and sorts ingredients by axis', () => {
    const unlocked = testContext.ingredients
      .filter((item) => item.newGameStarter)
      .map((item) => item.id);
    const ingredients = unlocked
      .map((id) => testContext.ingredientsById.get(id)!)
      .filter(Boolean);
    const highUmami = filterIngredientsByAxis(ingredients, 'UM', 5);
    expect(highUmami.length).toBeGreaterThan(0);
    const sorted = sortIngredientsByAxis(ingredients, 'SW', true);
    expect(sorted[0]!.flavor.SW).toBeGreaterThanOrEqual(sorted.at(-1)!.flavor.SW);
  });

  it('computes bar width percent on 0-10 scale', () => {
    expect(flavorBarWidthPercent(5, 10)).toBe(50);
    expect(flavorBarWidthPercent(12, 10)).toBe(100);
    expect(flavorBarWidthPercent(-1, 10)).toBe(0);
  });

  it('renders only nonzero flavor axes and omits empty groups', () => {
    const profile = zeroFlavor();
    profile.UM = 8;
    profile.EA = 3;
    profile.TE = 0;
    const html = renderFlavorBarsHtml(buildFlavorBarsViewModel(profile), { showValues: true });

    expect(html).toContain('Umami');
    expect(html).toContain('Earthy');
    expect(html).toContain('Basic Tastes');
    expect(html).toContain('Aroma');
    expect(html).not.toContain('Mouthfeel');
    expect(html).not.toContain('Sweet');
    expect(html).not.toContain('Salty');
    expect(html).not.toContain('Fruity');
    expect(html.match(/data-testid="flavor-axis-row"/g)?.length).toBe(2);
  });

  it('shows an empty hint when every axis is zero', () => {
    const html = renderFlavorBarsHtml(buildFlavorBarsViewModel(zeroFlavor()), {
      showValues: true,
    });
    expect(html).toContain('data-testid="flavor-bars-empty"');
    expect(html).not.toContain('flavor-axis-row');
  });
});
