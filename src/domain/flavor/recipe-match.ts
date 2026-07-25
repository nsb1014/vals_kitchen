import type { Recipe } from '../types.ts';

export function recipeMultisetKey(ingredientIds: string[]): string {
  return [...ingredientIds].sort().join('|');
}

export function findMatchingRecipe(
  ingredientIds: string[],
  recipes: Recipe[],
): Recipe | null {
  if (ingredientIds.length < 3 || ingredientIds.length > 6) return null;
  const key = recipeMultisetKey(ingredientIds);
  for (const recipe of recipes) {
    if (recipeMultisetKey(recipe.ingredientIds) === key) {
      return recipe;
    }
  }
  return null;
}

export const RECIPE_MATCH_BONUS = 0.75;
