import { foodIconBackgroundStyle } from './food-icon-manifest.ts';
import { foodIconSpriteName } from './ingredient-icons.ts';

export function renderFoodIconHtml(ingredientId: string, sizePx = 32): string {
  const style = foodIconBackgroundStyle(foodIconSpriteName(ingredientId), sizePx);
  if (!style) return '';
  return `<span class="food-icon" style="${style}" aria-hidden="true"></span>`;
}

export { preloadFoodIconManifest, isFoodIconManifestReady } from './food-icon-manifest.ts';
