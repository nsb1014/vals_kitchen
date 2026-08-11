import { getDomainContext, getEquipmentNameMap } from '../../app/content-loader.ts';
import { AXIS_LABELS } from '../../domain/flavor/axis-labels.ts';
import {
  buildFlavorProfileViewModel,
  filterIngredientsByAxis,
  renderFlavorProfileHtml,
  sortIngredientsByAxis,
} from '../presentation/flavor-profile.ts';
import type { AxisKey } from '../../domain/types.ts';
import { AXIS_KEYS } from '../../domain/types.ts';
import { renderFoodIconHtml } from './food-icon.ts';

/** Shared long-press coach copy — compose chips + inspector modal. */
export const FLAVOR_INSPECTOR_LONG_PRESS_HINT =
  'Tip: tap the i button on a chip (or long-press) to inspect its flavor profile.';

export function renderFlavorInspectorContent(
  ingredientId: string,
  options?: { showLongPressHint?: boolean },
): string {
  const ctx = getDomainContext();
  const ingredient = ctx.ingredientsById.get(ingredientId);
  if (!ingredient) {
    return '<p class="screen-empty">Ingredient not found.</p>';
  }

  const model = buildFlavorProfileViewModel(ingredient, getEquipmentNameMap());
  const hint = options?.showLongPressHint
    ? `<p class="inspector-long-press-hint" data-testid="inspector-long-press-hint">${FLAVOR_INSPECTOR_LONG_PRESS_HINT}</p>`
    : '';
  return `${hint}<div class="flavor-profile">${renderFlavorProfileHtml(model)}</div>`;
}

export function buildInspectorIngredientList(
  unlockedIds: string[],
  filterAxis: AxisKey | 'none',
  sortDescending = true,
): string {
  const ctx = getDomainContext();
  let ingredients = unlockedIds
    .map((id) => ctx.ingredientsById.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (filterAxis !== 'none') {
    ingredients = filterIngredientsByAxis(ingredients, filterAxis, 4);
    ingredients = sortIngredientsByAxis(ingredients, filterAxis, sortDescending);
  } else {
    ingredients.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (ingredients.length === 0) {
    return '<p class="screen-empty">No ingredients match this filter.</p>';
  }

  return ingredients
    .map(
      (item) =>
        `<button type="button" class="inspector-list-item" data-ingredient-id="${item.id}">${renderFoodIconHtml(item.id, 28)}<span>${item.name}</span><span class="inspector-list-meta">${item.category}</span></button>`,
    )
    .join('');
}

export function inspectorFilterOptions(): string {
  const options = ['<option value="none">All unlocked</option>'];
  for (const axis of AXIS_KEYS) {
    options.push(`<option value="${axis}">High ${AXIS_LABELS[axis]}</option>`);
  }
  return options.join('');
}
