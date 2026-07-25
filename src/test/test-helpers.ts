import ingredients from '../data/ingredients.json';
import equipment from '../data/equipment.json';
import recipes from '../data/recipes.json';
import archetypes from '../data/archetypes.json';
import compoundAffinity from '../data/compound-affinity.json';
import modifiers from '../data/modifiers.json';
import { installContentForTests } from '../app/content-loader.ts';
import type { DailyModifier } from '../domain/day/modifiers.ts';
import type { ContentBundle, Ingredient } from '../domain/types.ts';

const bundle: ContentBundle = {
  ingredients: ingredients as Ingredient[],
  equipment,
  recipes,
  archetypes,
  compoundAffinity,
};

export const testContext = installContentForTests({
  ingredients: bundle.ingredients,
  recipes: bundle.recipes,
  archetypes: bundle.archetypes,
  modifiers: modifiers as DailyModifier[],
  compoundAffinity: bundle.compoundAffinity,
  equipment: bundle.equipment,
});

export { bundle as testBundle };
