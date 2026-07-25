import { describe, expect, it } from 'vitest';
import { testContext } from '../test-helpers.ts';
import {
  canToggleIngredient,
  computeDishPreview,
  temperatureLabel,
} from '../../ui/presentation/dish-preview.ts';

describe('dish preview presentation', () => {
  it('computes flavor profile preview for selected ingredients', () => {
    const preview = computeDishPreview(
      ['flour', 'salt', 'butter'],
      testContext.ingredientsById,
    );
    expect(preview.ingredientCount).toBe(3);
    expect(preview.isValidCount).toBe(true);
    expect(preview.profile).not.toBeNull();
    expect(preview.topAxes.length).toBeGreaterThan(0);
    expect(preview.temperatureLabel).toBe(temperatureLabel(preview.profile!.TE));
  });

  it('enforces 3–6 ingredient selection in the UI helper', () => {
    const two = canToggleIngredient('onion', ['flour', 'salt']);
    expect(two.allowed).toBe(true);
    expect(two.nextIds).toEqual(['flour', 'salt', 'onion']);

    const seven = canToggleIngredient('garlic', [
      'flour',
      'salt',
      'butter',
      'onion',
      'chicken',
      'rice',
    ]);
    expect(seven.allowed).toBe(false);
    expect(seven.nextIds).toHaveLength(6);
  });
});
