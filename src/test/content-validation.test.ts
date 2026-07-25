import { describe, expect, it } from 'vitest';
import ingredients from '../data/ingredients.json';
import equipment from '../data/equipment.json';
import recipes from '../data/recipes.json';
import archetypes from '../data/archetypes.json';
import compoundAffinity from '../data/compound-affinity.json';
import { validateContent } from '../domain/content/validate-content.ts';
import type { ContentBundle, Ingredient } from '../domain/types.ts';

const bundle: ContentBundle = {
  ingredients: ingredients as Ingredient[],
  equipment,
  recipes,
  archetypes,
  compoundAffinity,
};

describe('content validators', () => {
  it('passes V1-V9 invariants', { timeout: 120_000 }, () => {
    const report = validateContent(bundle);
    expect(report.errors, report.errors.join('\n')).toEqual([]);
  });

  it('has at least 950 recipes and 100 ingredients', () => {
    expect(bundle.ingredients.length).toBe(100);
    expect(bundle.recipes.length).toBeGreaterThanOrEqual(950);
    expect(bundle.equipment.length).toBe(12);
    expect(bundle.archetypes.length).toBe(20);
  });
});
