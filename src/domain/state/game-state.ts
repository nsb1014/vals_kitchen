import {
  NEW_GAME_STARTER_IDS,
  STARTING_EQUIPMENT_IDS,
} from '../types.ts';
import type { ActiveDay } from '../day/types.ts';
import type { RecipeMasteryMap } from '../floor/mastery.ts';
import { createStarterMap, isPerimeterWallCell } from '../floor/starter-map.ts';
import { seatsFromPlacements } from '../floor/seats.ts';
import { createRng } from '../rng/index.ts';
import {
  createEmptyDecorPurchasedCounts,
  normalizeDecorPurchasedCounts,
  type DecorPurchasedCounts,
} from '../economy/decor.ts';
import type { AchievementId } from '../achievements/catalog.ts';

export const STARTING_GRID = { w: 4, h: 4 } as const;
export const STARTING_CASH = 500;
export const SOFT_RESET_CASH = 100;
export const MIN_DISH_INGREDIENTS = 3;
export const MAX_DISH_INGREDIENTS = 6;
export const TABLE_SEATS = 2;
export const MAX_GRID_SIZE = 12;
export const RECIPE_BONUS_STARS = 0.75;
/** Save v5: unlocked achievement ids are persisted. */
export const CURRENT_SAVE_VERSION = 5 as const;

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
  recipeMastery: RecipeMasteryMap;
  unlockedAchievementIds: AchievementId[];
  gridSize: { w: number; h: number };
  /** Furniture on the main dining + kitchen floor. */
  placements: Placement[];
  /** Stations on the unlocked back-kitchen room (same grid dimensions). */
  backKitchenPlacements: Placement[];
  seatingCapacity: number;
  tableCount: number;
  /** Lifetime-per-run ownership used for placement availability and achievements. */
  decorPurchasedCounts: DecorPurchasedCounts;
  gridExpansionCount: number;
  /** One-time unlock: separate back-kitchen room + connecting door. */
  kitchenAnnexOwned: boolean;
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
  return createStarterMap().placements.map((p) => ({ ...p }));
}

export function seatingFromTableCount(tableCount: number): number {
  return tableCount * TABLE_SEATS;
}

export function seatingFromPlacements(placements: Placement[]): number {
  return seatsFromPlacements(placements).length;
}

/**
 * Migrate saves that widened the main floor by +2 annex columns into the
 * same-size back-kitchen room model. Idempotent when backKitchenPlacements exists
 * and width no longer carries the annex bonus.
 */
export function migrateAnnexWidthToBackRoom(raw: {
  kitchenAnnexOwned?: boolean;
  gridSize?: { w: number; h: number };
  placements?: Placement[];
  backKitchenPlacements?: Placement[];
}): {
  gridSize: { w: number; h: number };
  placements: Placement[];
  backKitchenPlacements: Placement[];
} {
  const starter = createStarterMap();
  const kitchenAnnexOwned = Boolean(raw.kitchenAnnexOwned);
  let gridSize = { ...(raw.gridSize ?? starter.gridSize) };
  let placements = (raw.placements ?? starter.placements).map((p) => ({ ...p }));
  let backKitchenPlacements = (raw.backKitchenPlacements ?? []).map((p) => ({ ...p }));

  const hadSeparateRoomField = raw.backKitchenPlacements !== undefined;
  if (kitchenAnnexOwned && !hadSeparateRoomField) {
    // Width-annex era always added +2 columns once.
    const reclaim = 2;
    const newW = Math.min(MAX_GRID_SIZE, Math.max(starter.gridSize.w, gridSize.w - reclaim));
    if (newW < gridSize.w) {
      const stay: Placement[] = [];
      const moved: Placement[] = [];
      for (const p of placements) {
        if (p.x >= newW - 1) {
          moved.push(p);
        } else {
          stay.push(p);
        }
      }
      placements = stay;
      gridSize = { ...gridSize, w: newW };
      const occupied = new Set(backKitchenPlacements.map((p) => `${p.x},${p.y}`));
      let cursorY = 1;
      let cursorX = 1;
      for (const p of moved) {
        while (
          isPerimeterWallCell(cursorX, cursorY, gridSize.w, gridSize.h) ||
          occupied.has(`${cursorX},${cursorY}`)
        ) {
          cursorY += 1;
          if (cursorY >= gridSize.h - 1) {
            cursorY = 1;
            cursorX += 1;
          }
          if (cursorX >= gridSize.w - 1) break;
        }
        if (cursorX >= gridSize.w - 1) break;
        const next = { ...p, x: cursorX, y: cursorY };
        occupied.add(`${cursorX},${cursorY}`);
        backKitchenPlacements.push(next);
        cursorY += 1;
      }
    }
  }

  // Clamp any stray placements onto walls after width changes.
  placements = placements.filter(
    (p) =>
      p.x >= 0 &&
      p.y >= 0 &&
      p.x < gridSize.w &&
      p.y < gridSize.h &&
      !isPerimeterWallCell(p.x, p.y, gridSize.w, gridSize.h),
  );
  backKitchenPlacements = backKitchenPlacements.filter(
    (p) =>
      p.x >= 0 &&
      p.y >= 0 &&
      p.x < gridSize.w &&
      p.y < gridSize.h &&
      !isPerimeterWallCell(p.x, p.y, gridSize.w, gridSize.h),
  );

  if (gridSize.w > MAX_GRID_SIZE) {
    gridSize = { ...gridSize, w: MAX_GRID_SIZE };
  }

  return { gridSize, placements, backKitchenPlacements };
}

export function createNewGameState(seed?: number): GameState {
  const globalRunSeed = seed ?? createRng(Date.now()).nextInt(1, 0x7fffffff);
  const starter = createStarterMap();
  const placements = starter.placements.map((p) => ({ ...p }));
  const tableCount = placements.filter((p) => p.itemKey.startsWith('table')).length;
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
    recipeMastery: {},
    unlockedAchievementIds: [],
    gridSize: { ...starter.gridSize },
    placements,
    backKitchenPlacements: [],
    seatingCapacity: seatingFromPlacements(placements),
    tableCount,
    decorPurchasedCounts: createEmptyDecorPurchasedCounts(),
    gridExpansionCount: 0,
    kitchenAnnexOwned: false,
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
  const migrated = migrateAnnexWidthToBackRoom(raw);
  const placements = migrated.placements;
  const tableCount =
    raw.tableCount ?? Math.max(2, placements.filter((p) => p.itemKey.startsWith('table')).length);
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
    recipeMastery: raw.recipeMastery ?? {},
    unlockedAchievementIds: raw.unlockedAchievementIds ?? [],
    gridSize: migrated.gridSize,
    placements,
    backKitchenPlacements: migrated.backKitchenPlacements,
    seatingCapacity: raw.seatingCapacity ?? seatingFromTableCount(2),
    tableCount,
    decorPurchasedCounts: normalizeDecorPurchasedCounts(
      raw.decorPurchasedCounts,
      placements,
    ),
    gridExpansionCount: raw.gridExpansionCount ?? 0,
    kitchenAnnexOwned: raw.kitchenAnnexOwned ?? false,
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
