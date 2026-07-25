import type { Archetype, Ingredient, Recipe } from './types.ts';
import type { DailyModifier } from './day/modifiers.ts';

export interface DomainContext {
  ingredients: Ingredient[];
  ingredientsById: Map<string, Ingredient>;
  recipes: Recipe[];
  archetypes: Archetype[];
  modifiers: DailyModifier[];
  modifiersById: Map<string, DailyModifier>;
  compoundAffinity: Record<string, Record<string, number>>;
  equipmentById: Map<string, { id: string; purchaseIndex: number | null }>;
}

export function createDomainContext(input: {
  ingredients: Ingredient[];
  recipes: Recipe[];
  archetypes: Archetype[];
  modifiers: DailyModifier[];
  compoundAffinity: Record<string, Record<string, number>>;
  equipment: Array<{ id: string; purchaseIndex: number | null }>;
}): DomainContext {
  return {
    ingredients: input.ingredients,
    ingredientsById: new Map(input.ingredients.map((item) => [item.id, item])),
    recipes: input.recipes,
    archetypes: input.archetypes,
    modifiers: input.modifiers,
    modifiersById: new Map(input.modifiers.map((item) => [item.id, item])),
    compoundAffinity: input.compoundAffinity,
    equipmentById: new Map(input.equipment.map((item) => [item.id, item])),
  };
}
