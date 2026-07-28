import type { AxisKey, FlavorVector, Ingredient } from '../../domain/types.ts';
import { AXIS_KEYS } from '../../domain/types.ts';
import { AXIS_LABELS } from '../../domain/flavor/axis-labels.ts';
import { temperatureLabel } from './dish-preview.ts';

export type FlavorAxisGroup = 'taste' | 'aroma' | 'mouthfeel';

export interface FlavorAxisRow {
  key: AxisKey | 'TE';
  label: string;
  value: number;
  max: number;
  group: FlavorAxisGroup;
  displayValue: string;
}

export interface FlavorProfileViewModel {
  ingredientId: string;
  name: string;
  category: string;
  equipmentId: string;
  equipmentGateLabel: string;
  temperature: { value: -1 | 0 | 1; label: string };
  axes: FlavorAxisRow[];
}

export interface FlavorBarsViewModel {
  title?: string;
  subtitle?: string;
  temperature: { value: -1 | 0 | 1; label: string };
  axes: FlavorAxisRow[];
}

const TASTE_AXES: AxisKey[] = ['SW', 'SA', 'SO', 'BI', 'UM'];
const AROMA_AXES: AxisKey[] = ['HE', 'FR', 'EA', 'SM', 'PU', 'NU'];
const MOUTHFEEL_AXES: AxisKey[] = ['RI', 'LI', 'HT', 'CR'];

function axisGroup(axis: AxisKey): FlavorAxisGroup {
  if (TASTE_AXES.includes(axis)) return 'taste';
  if (AROMA_AXES.includes(axis)) return 'aroma';
  if (MOUTHFEEL_AXES.includes(axis)) return 'mouthfeel';
  return 'mouthfeel';
}

function buildAxisRows(profile: FlavorVector): FlavorAxisRow[] {
  return AXIS_KEYS.map((key) => ({
    key,
    label: AXIS_LABELS[key],
    value: profile[key],
    max: 10,
    group: axisGroup(key),
    displayValue: profile[key].toFixed(1),
  }));
}

export function buildFlavorProfileViewModel(
  ingredient: Ingredient,
  equipmentNameById: Map<string, string>,
): FlavorProfileViewModel {
  return {
    ingredientId: ingredient.id,
    name: ingredient.name,
    category: ingredient.category,
    equipmentId: ingredient.equipmentId,
    equipmentGateLabel: equipmentNameById.get(ingredient.equipmentId) ?? ingredient.equipmentId,
    temperature: {
      value: ingredient.flavor.TE,
      label: temperatureLabel(ingredient.flavor.TE),
    },
    axes: buildAxisRows(ingredient.flavor),
  };
}

/** Bars for any flavor vector (dish preview, customer ideal profile). */
export function buildFlavorBarsViewModel(
  profile: FlavorVector,
  options?: { title?: string; subtitle?: string },
): FlavorBarsViewModel {
  return {
    title: options?.title,
    subtitle: options?.subtitle,
    temperature: {
      value: profile.TE,
      label: temperatureLabel(profile.TE),
    },
    axes: buildAxisRows(profile),
  };
}

export function filterIngredientsByAxis(
  ingredients: Ingredient[],
  axis: AxisKey,
  minValue: number,
): Ingredient[] {
  return ingredients.filter((item) => item.flavor[axis] >= minValue);
}

export function sortIngredientsByAxis(
  ingredients: Ingredient[],
  axis: AxisKey,
  descending = true,
): Ingredient[] {
  return [...ingredients].sort((a, b) => {
    const delta = a.flavor[axis] - b.flavor[axis];
    return descending ? -delta : delta;
  });
}

export function flavorBarWidthPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

/** Visible nonzero on the 0–10 bars (hides values that would display as 0.0). */
export function isVisibleFlavorAxisValue(value: number): boolean {
  return Math.abs(value) >= 0.05;
}

export function renderFlavorBarsHtml(
  model: Pick<FlavorBarsViewModel, 'axes' | 'temperature'> & {
    title?: string;
    subtitle?: string;
  },
  options: { showValues: boolean; showTemp?: boolean } = { showValues: true },
): string {
  const showTemp = options.showTemp !== false;
  const groups: Array<{ id: FlavorAxisGroup; title: string }> = [
    { id: 'taste', title: 'Basic Tastes' },
    { id: 'aroma', title: 'Aroma' },
    { id: 'mouthfeel', title: 'Mouthfeel' },
  ];

  const groupHtml = groups
    .map((group) => {
      const rows = model.axes
        .filter((row) => row.group === group.id && isVisibleFlavorAxisValue(row.value))
        .map((row) => {
          const valueCell = options.showValues
            ? `<span class="flavor-bar-value">${row.displayValue}</span>`
            : '';
          return `
          <div class="flavor-bar-row${options.showValues ? '' : ' no-value'}" data-testid="flavor-axis-row">
            <span class="flavor-bar-label">${row.label}</span>
            <div class="flavor-bar-track" role="meter" aria-label="${row.label}" aria-valuemin="0" aria-valuemax="${row.max}" aria-valuenow="${row.value}">
              <div class="flavor-bar-fill" style="width:${flavorBarWidthPercent(row.value, row.max).toFixed(1)}%"></div>
            </div>
            ${valueCell}
          </div>`;
        })
        .join('');
      if (!rows) return '';
      return `<section class="flavor-group"><h3 class="flavor-group-title">${group.title}</h3>${rows}</section>`;
    })
    .join('');

  const header =
    model.title || model.subtitle || showTemp
      ? `<header class="flavor-profile-header">
          ${model.title ? `<h2 class="flavor-profile-name">${model.title}</h2>` : ''}
          ${model.subtitle ? `<p class="flavor-profile-meta">${model.subtitle}</p>` : ''}
          ${
            showTemp
              ? `<p class="flavor-temp-badge" aria-label="Temperature ${model.temperature.label}">Temp: ${model.temperature.label}</p>`
              : ''
          }
        </header>`
      : '';

  const body =
    groupHtml ||
    `<p class="flavor-bars-empty" data-testid="flavor-bars-empty">No notable flavors</p>`;

  return `${header}${body}`;
}

export function renderFlavorProfileHtml(model: FlavorProfileViewModel): string {
  return renderFlavorBarsHtml(
    {
      title: model.name,
      subtitle: `${model.category} · Unlocked by ${model.equipmentGateLabel}`,
      temperature: model.temperature,
      axes: model.axes,
    },
    { showValues: true },
  );
}

export type { FlavorVector };
