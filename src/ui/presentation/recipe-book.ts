import type { Recipe } from '../../domain/types.ts';

export const RECIPE_PAGE_SIZE = 40;

export interface RecipeBookEntry {
  id: string;
  name: string;
  cuisineTag: string;
  ingredientNames: string[];
  ingredientIds: string[];
}

export interface RecipeBookPage {
  pageIndex: number;
  totalPages: number;
  entries: RecipeBookEntry[];
  startIndex: number;
  endIndex: number;
}

export interface RecipeBookProgress {
  discovered: number;
  total: number;
  percentLabel: string;
}

export function buildRecipeBookProgress(
  discoveredIds: string[],
  totalRecipes: number,
): RecipeBookProgress {
  const discovered = discoveredIds.length;
  const total = totalRecipes;
  const pct = total > 0 ? (discovered / total) * 100 : 0;
  return {
    discovered,
    total,
    percentLabel: `${discovered} / ${total} (${pct.toFixed(1)}%)`,
  };
}

export function filterDiscoveredRecipes(
  recipes: Recipe[],
  discoveredIds: string[],
  query: string,
): Recipe[] {
  const discovered = new Set(discoveredIds);
  const normalized = query.trim().toLowerCase();
  return recipes.filter((recipe) => {
    if (!discovered.has(recipe.id)) return false;
    if (!normalized) return true;
    if (recipe.name.toLowerCase().includes(normalized)) return true;
    if (recipe.cuisineTag.toLowerCase().includes(normalized)) return true;
    return recipe.ingredientIds.some((id) => id.toLowerCase().includes(normalized));
  });
}

export function mapRecipeToEntry(
  recipe: Recipe,
  ingredientNameById: Map<string, string>,
): RecipeBookEntry {
  return {
    id: recipe.id,
    name: recipe.name,
    cuisineTag: recipe.cuisineTag,
    ingredientIds: [...recipe.ingredientIds],
    ingredientNames: recipe.ingredientIds.map((id) => ingredientNameById.get(id) ?? id),
  };
}

export function paginateRecipeEntries(
  entries: RecipeBookEntry[],
  pageIndex: number,
  pageSize = RECIPE_PAGE_SIZE,
): RecipeBookPage {
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const clampedPage = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const startIndex = clampedPage * pageSize;
  const endIndex = Math.min(entries.length, startIndex + pageSize);
  return {
    pageIndex: clampedPage,
    totalPages,
    entries: entries.slice(startIndex, endIndex),
    startIndex,
    endIndex,
  };
}

export function virtualWindowRange(
  scrollTop: number,
  viewportHeight: number,
  itemCount: number,
  itemHeight: number,
  overscan = 4,
): { start: number; end: number; offsetY: number; totalHeight: number } {
  const totalHeight = itemCount * itemHeight;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / itemHeight) + overscan * 2;
  const end = Math.min(itemCount, start + visibleCount);
  return {
    start,
    end,
    offsetY: start * itemHeight,
    totalHeight,
  };
}
