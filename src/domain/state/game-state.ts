import {
  NEW_GAME_STARTER_IDS,
  STARTING_EQUIPMENT_IDS,
} from '../types.ts';
import type { ActiveDay } from '../day/types.ts';
import { createRng } from '../rng/index.ts';

export const STARTING_GRID = { w: 4, h: 4 } as const;
export const STARTING_CASH = 500;
export const SOFT_RESET_CASH = 100;
export const MIN_DISH_INGREDIENTS = 3;
export const MAX_DISH_INGREDIENTS = 6;
export const TABLE_SEATS = 2;
export const MAX_GRID_SIZE = 12;
export const RECIPE_BONUS_STARS = 0.75;
export const CURRENT_SAVE_VERSION = 1 as const;

export interface Placement {
  id: string;
  itemKey: string;
  x: number;
  y: number;
  rotation: number;
}

export interface GameStats {
  totalCustomersServed: number;
  totalEarnings: number;
  prestigesTotal: number;
}

export interface GameState {
  saveVersion: typeof CURRENT_SAVE_VERSION;
  globalRunSeed: number;
  day: number;
  cash: number;
  prestige: number;
  rating: number;
  unlockedIngredientIds: string[];
  purchasedEquipmentIds: string[];
  discoveredRecipeIds: string[];
  gridSize: { w: number; h: number };
  placements: Placement[];
  seatingCapacity: number;
  tableCount: number;
  gridExpansionCount: number;
  ingredientUnlockIndex: number;
  activeDay: ActiveDay | null;
  composeDraftIngredientIds?: string[];
  stats: GameStats;
}

let placementCounter = 0;

export function nextPlacementId(): string {
  placementCounter += 1;
  return `placement_${placementCounter}`;
}

export function createDefaultPlacements(): Placement[] {
  return [
    { id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
    { id: 'table_2', itemKey: 'table_2seat', x: 2, y: 0, rotation: 0 },
  ];
}

export function seatingFromTableCount(tableCount: number): number {
  return tableCount * TABLE_SEATS;
}

export function createNewGameState(seed?: number): GameState {
  const globalRunSeed = seed ?? createRng(Date.now()).nextInt(1, 0x7fffffff);
  return {
    saveVersion: CURRENT_SAVE_VERSION,
    globalRunSeed,
    day: 1,
    cash: STARTING_CASH,
    prestige: 0,
    rating: 3,
    unlockedIngredientIds: [...NEW_GAME_STARTER_IDS],
    purchasedEquipmentIds: [...STARTING_EQUIPMENT_IDS],
    discoveredRecipeIds: [],
    gridSize: { ...STARTING_GRID },
    placements: createDefaultPlacements(),
    seatingCapacity: seatingFromTableCount(2),
    tableCount: 2,
    gridExpansionCount: 0,
    ingredientUnlockIndex: 0,
    activeDay: null,
    composeDraftIngredientIds: undefined,
    stats: {
      totalCustomersServed: 0,
      totalEarnings: 0,
      prestigesTotal: 0,
    },
  };
}

export function normalizeGameState(raw: GameState): GameState {
  const placements = raw.placements ?? createDefaultPlacements();
  const tableCount = raw.tableCount ?? Math.max(2, placements.filter((p) => p.itemKey.startsWith('table')).length);
  return {
    saveVersion: CURRENT_SAVE_VERSION,
    globalRunSeed: raw.globalRunSeed ?? 1,
    day: raw.day ?? 1,
    cash: raw.cash ?? STARTING_CASH,
    prestige: raw.prestige ?? 0,
    rating: raw.rating ?? 3,
    unlockedIngredientIds: raw.unlockedIngredientIds ?? [...NEW_GAME_STARTER_IDS],
    purchasedEquipmentIds: raw.purchasedEquipmentIds ?? [...STARTING_EQUIPMENT_IDS],
    discoveredRecipeIds: raw.discoveredRecipeIds ?? [],
    gridSize: raw.gridSize ?? { ...STARTING_GRID },
    placements,
    seatingCapacity: raw.seatingCapacity ?? seatingFromTableCount(2),
    tableCount,
    gridExpansionCount: raw.gridExpansionCount ?? 0,
    ingredientUnlockIndex: raw.ingredientUnlockIndex ?? 0,
    activeDay: raw.activeDay ?? null,
    composeDraftIngredientIds: raw.composeDraftIngredientIds,
    stats: raw.stats ?? {
      totalCustomersServed: 0,
      totalEarnings: 0,
      prestigesTotal: 0,
    },
  };
}

export function cloneGameState(state: GameState): GameState {
  return structuredClone(state);
}
