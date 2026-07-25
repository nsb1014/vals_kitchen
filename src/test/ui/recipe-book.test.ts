import { describe, expect, it } from 'vitest';
import {
  buildRecipeBookProgress,
  filterDiscoveredRecipes,
  paginateRecipeEntries,
  virtualWindowRange,
} from '../../ui/presentation/recipe-book.ts';
import { testContext } from '../test-helpers.ts';

describe('recipe book presentation', () => {
  it('reports discovery progress against corpus size', () => {
    const progress = buildRecipeBookProgress(['r1', 'r2'], 1000);
    expect(progress.discovered).toBe(2);
    expect(progress.total).toBe(1000);
    expect(progress.percentLabel).toContain('0.2%');
  });

  it('filters discovered recipes by query', () => {
    const sample = testContext.recipes.slice(0, 5);
    const discovered = sample.map((recipe) => recipe.id);
    const filtered = filterDiscoveredRecipes(sample, discovered, sample[0]!.name.slice(0, 4));
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((recipe) => discovered.includes(recipe.id))).toBe(true);
  });

  it('paginates and virtualizes without rendering full corpus', () => {
    const entries = Array.from({ length: 120 }, (_, index) => ({
      id: `r${index}`,
      name: `Recipe ${index}`,
      cuisineTag: 'test',
      ingredientIds: ['flour'],
      ingredientNames: ['Flour'],
      masteryLevel: 0,
    }));
    const page = paginateRecipeEntries(entries, 1, 40);
    expect(page.entries).toHaveLength(40);
    expect(page.totalPages).toBe(3);

    const window = virtualWindowRange(200, 300, page.entries.length, 88);
    expect(window.end - window.start).toBeLessThan(page.entries.length);
  });
});
