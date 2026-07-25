import type {
  ContentBundle,
  Equipment,
  Ingredient,
  Recipe,
} from '../types.ts';
import {
  AXIS_KEYS,
  EQUIPMENT_IDS,
  NEW_GAME_STARTER_IDS,
  SOFT_RESET_STARTER_IDS,
} from '../types.ts';
import {
  createRng,
  generateCustomerRequest,
} from '../day/customer-request-generator.ts';
import { aggregateDish } from '../flavor/aggregate.ts';
import { computeMatchStars } from '../flavor/scoring.ts';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

const BLOCKLIST = ['themealdb', 'recipenlg', 'food.com', 'wikibooks'];

function satisfiabilityFloor(unlockedCount: number): number {
  if (unlockedCount <= 5) return 6.5;
  if (unlockedCount <= 12) return 6.8;
  return 7.0;
}

function equipmentCost(purchaseIndex: number): number {
  return Math.floor(500 * Math.pow(1.18, purchaseIndex));
}

export function buildEquipmentDefinitions(): Equipment[] {
  const rows: Array<Omit<Equipment, 'cost'>> = [
    { id: 'prep_station', name: 'Prep Station', ingredientGroupName: 'Pantry & Basics', purchaseIndex: null },
    { id: 'grill', name: 'Grill', ingredientGroupName: 'Grilled & Charred', purchaseIndex: 0 },
    { id: 'oven', name: 'Oven', ingredientGroupName: 'Roasted & Baked', purchaseIndex: 1 },
    { id: 'fryer', name: 'Fryer', ingredientGroupName: 'Fried & Crispy', purchaseIndex: 2 },
    { id: 'stockpot', name: 'Stockpot', ingredientGroupName: 'Simmered & Broths', purchaseIndex: 3 },
    { id: 'cold_station', name: 'Cold Station', ingredientGroupName: 'Fresh & Raw', purchaseIndex: 4 },
    { id: 'pastry_bench', name: 'Pastry Bench', ingredientGroupName: 'Pastry & Dough', purchaseIndex: 5 },
    { id: 'smoker', name: 'Smoker', ingredientGroupName: 'Smoked & BBQ', purchaseIndex: 6 },
    { id: 'wok', name: 'Wok', ingredientGroupName: 'Stir-Fry Pan', purchaseIndex: 7 },
    { id: 'fermentation_crock', name: 'Fermentation Crock', ingredientGroupName: 'Pickled & Fermented', purchaseIndex: 8 },
    { id: 'barista_station', name: 'Barista Station', ingredientGroupName: 'Coffee & Tea', purchaseIndex: 9 },
    { id: 'spice_rack', name: 'Spice Rack', ingredientGroupName: 'Herbs & Spices', purchaseIndex: 10 },
  ];
  return rows.map((row) => ({
    ...row,
    cost: row.purchaseIndex === null ? 0 : equipmentCost(row.purchaseIndex),
  }));
}

export function buildCompoundAffinity(ingredients: Ingredient[]): Record<string, Record<string, number>> {
  const matrix: Record<string, Record<string, number>> = {};
  let max = 0;

  for (let i = 0; i < ingredients.length; i++) {
    for (let j = i + 1; j < ingredients.length; j++) {
      const a = ingredients[i]!;
      const b = ingredients[j]!;
      const intersection = a.compoundIds.filter((id) => b.compoundIds.includes(id));
      const raw =
        intersection.length /
        Math.max(1, Math.min(a.compoundIds.length, b.compoundIds.length));
      max = Math.max(max, raw);
      const keyA = a.id;
      const keyB = b.id;
      matrix[keyA] ??= {};
      matrix[keyB] ??= {};
      matrix[keyA][keyB] = raw;
      matrix[keyB][keyA] = raw;
    }
  }

  for (const a of Object.keys(matrix)) {
    for (const b of Object.keys(matrix[a]!)) {
      matrix[a]![b] = max === 0 ? 0 : matrix[a]![b]! / max;
    }
  }
  return matrix;
}

function recipeUsageCounts(recipes: Recipe[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const recipe of recipes) {
    for (const id of recipe.ingredientIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

function representativeUnlockStates(ingredients: Ingredient[], equipment: Equipment[]): string[][] {
  const byEquipment = new Map<string, Ingredient[]>();
  for (const ingredient of ingredients) {
    const list = byEquipment.get(ingredient.equipmentId) ?? [];
    list.push(ingredient);
    byEquipment.set(ingredient.equipmentId, list);
  }

  const states: string[][] = [];
  states.push([...NEW_GAME_STARTER_IDS]);
  states.push([...SOFT_RESET_STARTER_IDS]);

  const orderedEquipment = equipment.filter((item) => item.id !== 'prep_station');
  let cumulative = [...byEquipment.get('prep_station')!.map((item) => item.id)];
  states.push([...cumulative]);

  for (const gate of orderedEquipment) {
    cumulative = [...cumulative, ...(byEquipment.get(gate.id) ?? []).map((item) => item.id)];
    states.push([...cumulative]);
  }

  return states;
}

export function validateContent(data: ContentBundle): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ingredientIds = new Set(data.ingredients.map((item) => item.id));

  if (data.ingredients.length !== 100) {
    errors.push(`V1: expected 100 ingredients, got ${data.ingredients.length}`);
  }

  for (const id of NEW_GAME_STARTER_IDS) {
    const item = data.ingredients.find((entry) => entry.id === id);
    if (!item?.newGameStarter) errors.push(`V1: missing newGameStarter for ${id}`);
  }
  for (const id of SOFT_RESET_STARTER_IDS) {
    const item = data.ingredients.find((entry) => entry.id === id);
    if (!item?.softResetStarter) errors.push(`V1: missing softResetStarter for ${id}`);
  }

  const equipmentCounts = new Map<string, number>();
  for (const ingredient of data.ingredients) {
    equipmentCounts.set(ingredient.equipmentId, (equipmentCounts.get(ingredient.equipmentId) ?? 0) + 1);
    if (!EQUIPMENT_IDS.includes(ingredient.equipmentId as (typeof EQUIPMENT_IDS)[number])) {
      errors.push(`V9: unknown equipmentId ${ingredient.equipmentId} on ${ingredient.id}`);
    }
    for (const axis of AXIS_KEYS) {
      const value = ingredient.flavor[axis];
      if (value < 0 || value > 10) {
        errors.push(`V4: ${ingredient.id}.${axis} out of range (${value})`);
      }
    }
    if (![-1, 0, 1].includes(ingredient.flavor.TE)) {
      errors.push(`V4: ${ingredient.id}.TE invalid (${ingredient.flavor.TE})`);
    }
  }

  for (const equipmentId of EQUIPMENT_IDS) {
    const count = equipmentCounts.get(equipmentId) ?? 0;
    if (count === 0) errors.push(`V9: equipment group ${equipmentId} has no ingredients`);
  }

  const assigned = data.ingredients.length;
  const groupSum = [...equipmentCounts.values()].reduce((sum, n) => sum + n, 0);
  if (groupSum !== assigned) errors.push(`V9: equipment partition mismatch (${groupSum} != ${assigned})`);

  const multisets = new Set<string>();
  for (const recipe of data.recipes) {
    if (recipe.ingredientIds.length < 3 || recipe.ingredientIds.length > 6) {
      errors.push(`V2: recipe ${recipe.id} has ${recipe.ingredientIds.length} ingredients`);
    }
    const unique = new Set(recipe.ingredientIds);
    if (unique.size !== recipe.ingredientIds.length) {
      errors.push(`V2: recipe ${recipe.id} has duplicate ingredients`);
    }
    for (const id of recipe.ingredientIds) {
      if (!ingredientIds.has(id)) errors.push(`V2: recipe ${recipe.id} references unknown ${id}`);
    }
    const key = [...recipe.ingredientIds].sort().join('|');
    if (multisets.has(key)) errors.push(`V3: duplicate multiset ${key}`);
    multisets.add(key);

    const blob = `${recipe.name} ${recipe.description}`.toLowerCase();
    for (const blocked of BLOCKLIST) {
      if (blob.includes(blocked)) errors.push(`V7: blocked prose token "${blocked}" in ${recipe.id}`);
    }
  }

  const usage = recipeUsageCounts(data.recipes);
  for (const ingredient of data.ingredients) {
    const count = usage.get(ingredient.id) ?? 0;
    if (count < 5) errors.push(`V6: ingredient ${ingredient.id} appears in ${count} recipes`);
    if (count === 0) warnings.push(`ingredient ${ingredient.id} unused in recipes`);
  }

  for (const a of Object.keys(data.compoundAffinity)) {
    for (const b of Object.keys(data.compoundAffinity[a]!)) {
      const forward = data.compoundAffinity[a]![b]!;
      const reverse = data.compoundAffinity[b]?.[a];
      if (reverse === undefined) errors.push(`V8: missing reverse affinity ${b}->${a}`);
      else if (Math.abs(forward - reverse) > 0.0001) errors.push(`V8: asymmetric affinity ${a}<->${b}`);
      if (forward < 0 || forward > 1) errors.push(`V8: affinity out of range ${a}<->${b}`);
    }
  }

  const ingredientsById = new Map(data.ingredients.map((item) => [item.id, item]));
  const unlockStates = representativeUnlockStates(data.ingredients, data.equipment);
  for (const unlockedIds of unlockStates) {
    if (unlockedIds.length < 3) continue;
    const rng = createRng(unlockedIds.length * 1009);
    for (let i = 0; i < 40; i++) {
      const archetype = data.archetypes[rng.nextInt(0, data.archetypes.length - 1)]!;
      try {
        const request = generateCustomerRequest(
          archetype,
          unlockedIds,
          ingredientsById,
          rng,
          data.compoundAffinity,
        );
        if (request.witnessIngredientIds.length < 3) continue;
        const witness = request.witnessIngredientIds
          .map((id) => ingredientsById.get(id))
          .filter((item): item is Ingredient => Boolean(item));
        const dish = aggregateDish(witness.map((item) => item.flavor));
        const score = computeMatchStars(
          dish,
          request.preference,
          request.witnessIngredientIds,
          data.compoundAffinity,
        );
        const floor = satisfiabilityFloor(unlockedIds.length);
        if (score < floor) {
          errors.push(
            `V5: satisfiability failed for unlock size ${unlockedIds.length}, archetype ${archetype.id}, score ${score.toFixed(2)} (floor ${floor})`,
          );
        }
      } catch (error) {
        errors.push(
          `V5: generator failed for unlock size ${unlockedIds.length}, archetype ${archetype.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (data.recipes.length < 950) {
    errors.push(`recipe count ${data.recipes.length} below minimum 950`);
  }

  return { errors, warnings };
}

export function assertValidContent(data: ContentBundle): void {
  const report = validateContent(data);
  if (report.errors.length > 0) {
    throw new Error(report.errors.join('\n'));
  }
}
