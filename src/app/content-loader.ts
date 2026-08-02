import { createDomainContext, type DomainContext } from '../domain/context.ts';
import type { Archetype, Equipment, Ingredient, Recipe } from '../domain/types.ts';
import type { DailyModifier } from '../domain/day/modifiers.ts';

const DATA_BASE = '/data';

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${DATA_BASE}/${path}`);
  if (!response.ok) {
    throw new Error(`Failed to load content asset ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

let domainContext: DomainContext | null = null;
let equipmentCatalog: Equipment[] = [];
let scoringReady = false;
let recipesReady = false;
let scoringLoad: Promise<void> | null = null;
let recipesLoad: Promise<void> | null = null;

export function getDomainContext(): DomainContext {
  if (!domainContext) {
    throw new Error('Game content is not loaded yet');
  }
  return domainContext;
}

export function getEquipmentCatalog(): Equipment[] {
  return equipmentCatalog;
}

export function getEquipmentNameMap(): Map<string, string> {
  return new Map(equipmentCatalog.map((item) => [item.id, item.name]));
}

export function isScoringContentReady(): boolean {
  return scoringReady;
}

export function isRecipesContentReady(): boolean {
  return recipesReady;
}

/** Boot-critical content for the first screen and layout editing. */
export async function loadBootContent(): Promise<DomainContext> {
  const [ingredients, equipment, archetypes, modifiers] = await Promise.all([
    fetchJson<Ingredient[]>('ingredients.json'),
    fetchJson<Equipment[]>('equipment.json'),
    fetchJson<Archetype[]>('archetypes.json'),
    fetchJson<DailyModifier[]>('modifiers.json'),
  ]);

  equipmentCatalog = equipment;
  domainContext = createDomainContext({
    ingredients,
    equipment,
    archetypes,
    modifiers,
    compoundAffinity: {},
    recipes: [],
  });
  return domainContext;
}

/** compound-affinity is required before day generation and scoring. */
export async function ensureScoringContentLoaded(): Promise<void> {
  if (scoringReady) return;
  if (!domainContext) {
    throw new Error('Boot content must load before scoring content');
  }
  if (!scoringLoad) {
    scoringLoad = fetchJson<Record<string, Record<string, number>>>('compound-affinity.json').then(
      (compoundAffinity) => {
        domainContext!.compoundAffinity = compoundAffinity;
        scoringReady = true;
      },
    );
  }
  await scoringLoad;
}

/** Recipes are consulted only when a dish is served. */
export async function ensureRecipesLoaded(): Promise<void> {
  if (recipesReady) return;
  if (!domainContext) {
    throw new Error('Boot content must load before recipes');
  }
  if (!recipesLoad) {
    recipesLoad = fetchJson<Recipe[]>('recipes.json').then((recipes) => {
      domainContext!.recipes = recipes;
      recipesReady = true;
    });
  }
  await recipesLoad;
}

/** Warm deferred assets after first paint without blocking interaction. */
export function preloadDeferredContent(): void {
  void ensureScoringContentLoaded();
  void ensureRecipesLoaded();
}

export function ensureContentForAction(actionType: string): Promise<void> | void {
  if (actionType === 'OPEN_DAY') {
    return ensureScoringContentLoaded();
  }
  if (actionType === 'SERVE_DISH') {
    return ensureScoringContentLoaded().then(() => ensureRecipesLoaded());
  }
}

/** Test-only: inject bundled JSON without fetch (Node/vitest). */
export function installContentForTests(input: {
  ingredients: Ingredient[];
  recipes: Recipe[];
  archetypes: Archetype[];
  modifiers: DailyModifier[];
  compoundAffinity: Record<string, Record<string, number>>;
  equipment: Array<{ id: string; purchaseIndex: number | null }>;
}): DomainContext {
  equipmentCatalog = input.equipment as Equipment[];
  domainContext = createDomainContext(input);
  scoringReady = Object.keys(input.compoundAffinity).length > 0;
  recipesReady = input.recipes.length > 0;
  scoringLoad = null;
  recipesLoad = null;
  return domainContext;
}
