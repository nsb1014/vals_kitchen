import type { AxisKey, FlavorVector, Ingredient } from '../../domain/types.ts';
import { AXIS_KEYS } from '../../domain/types.ts';
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

const AXIS_LABELS: Record<AxisKey, string> = {
  SW: 'Sweet',
  SA: 'Salty',
  SO: 'Sour',
  BI: 'Bitter',
  UM: 'Umami',
  HE: 'Herbal',
  FR: 'Fruity',
  EA: 'Earthy',
  SM: 'Smoky',
  PU: 'Pungent',
  NU: 'Nutty',
  RI: 'Rich',
  LI: 'Light',
  HT: 'Heat',
  CR: 'Crunch',
};

const TASTE_AXES: AxisKey[] = ['SW', 'SA', 'SO', 'BI', 'UM'];
const AROMA_AXES: AxisKey[] = ['HE', 'FR', 'EA', 'SM', 'PU', 'NU'];
const MOUTHFEEL_AXES: AxisKey[] = ['RI', 'LI', 'HT', 'CR'];

function axisGroup(axis: AxisKey): FlavorAxisGroup {
  if (TASTE_AXES.includes(axis)) return 'taste';
  if (AROMA_AXES.includes(axis)) return 'aroma';
  if (MOUTHFEEL_AXES.includes(axis)) return 'mouthfeel';
  return 'mouthfeel';
}

export function buildFlavorProfileViewModel(
  ingredient: Ingredient,
  equipmentNameById: Map<string, string>,
): FlavorProfileViewModel {
  const axes: FlavorAxisRow[] = AXIS_KEYS.map((key) => ({
    key,
    label: AXIS_LABELS[key],
    value: ingredient.flavor[key],
    max: 10,
    group: axisGroup(key),
    displayValue: ingredient.flavor[key].toFixed(1),
  }));

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
    axes,
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

export function renderFlavorProfileHtml(model: FlavorProfileViewModel): string {
  const groups: Array<{ id: FlavorAxisGroup; title: string }> = [
    { id: 'taste', title: 'Basic Tastes' },
    { id: 'aroma', title: 'Aroma' },
    { id: 'mouthfeel', title: 'Mouthfeel' },
  ];

  const groupHtml = groups
    .map((group) => {
      const rows = model.axes
        .filter((row) => row.group === group.id)
        .map(
          (row) => `
          <div class="flavor-bar-row" data-testid="flavor-axis-row">
            <span class="flavor-bar-label">${row.label}</span>
            <div class="flavor-bar-track" role="meter" aria-label="${row.label}" aria-valuemin="0" aria-valuemax="${row.max}" aria-valuenow="${row.value}">
              <div class="flavor-bar-fill" style="width:${flavorBarWidthPercent(row.value, row.max).toFixed(1)}%"></div>
            </div>
            <span class="flavor-bar-value">${row.displayValue}</span>
          </div>`,
        )
        .join('');
      return `<section class="flavor-group"><h3 class="flavor-group-title">${group.title}</h3>${rows}</section>`;
    })
    .join('');

  return `
    <header class="flavor-profile-header">
      <h2 class="flavor-profile-name">${model.name}</h2>
      <p class="flavor-profile-meta">${model.category} · Unlocked by ${model.equipmentGateLabel}</p>
      <p class="flavor-temp-badge" aria-label="Temperature ${model.temperature.label}">Temp: ${model.temperature.label}</p>
    </header>
    ${groupHtml}
  `;
}

export type { FlavorVector };
