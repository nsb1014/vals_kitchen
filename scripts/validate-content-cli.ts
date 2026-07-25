import ingredients from '../src/data/ingredients.json';
import equipment from '../src/data/equipment.json';
import recipes from '../src/data/recipes.json';
import archetypes from '../src/data/archetypes.json';
import compoundAffinity from '../src/data/compound-affinity.json';
import { validateContent } from '../src/domain/content/validate-content.ts';
import type { ContentBundle, Ingredient } from '../src/domain/types.ts';

const bundle: ContentBundle = {
  ingredients: ingredients as Ingredient[],
  equipment,
  recipes,
  archetypes,
  compoundAffinity,
};

const report = validateContent(bundle);
if (report.warnings.length > 0) {
  console.warn('Warnings:\n' + report.warnings.join('\n'));
}
if (report.errors.length > 0) {
  console.error('Errors:\n' + report.errors.join('\n'));
  process.exit(1);
}
console.log('Content validation passed.');
