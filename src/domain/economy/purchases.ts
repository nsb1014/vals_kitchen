import { scaledUpgradeCost } from './costs.ts';
import type { DomainContext } from '../context.ts';
import type { GameState, Placement } from '../state/game-state.ts';
import {
  MAX_GRID_SIZE,
  cloneGameState,
  nextPlacementId,
  seatingFromPlacements,
  seatingFromTableCount,
  STARTING_GRID,
} from '../state/game-state.ts';
import { seatsFromPlacements } from '../floor/seats.ts';
import {
  isDiningCell,
  isKitchenCell,
  isPerimeterWallCell,
  mapZonesForGrid,
} from '../floor/starter-map.ts';
import { STARTING_EQUIPMENT_IDS } from '../types.ts';

function isTableItem(itemKey: string): boolean {
  return itemKey.startsWith('table');
}

function isStationItem(itemKey: string): boolean {
  return itemKey.endsWith('_station');
}

/** Furniture footprints + chair slots from placements other than `excludeId`. */
function occupiedCellsExcluding(placements: Placement[], excludeId?: string): Set<string> {
  const others = placements.filter((item) => item.id !== excludeId);
  const occupied = new Set<string>();
  for (const item of others) {
    occupied.add(`${item.x},${item.y}`);
  }
  for (const seat of seatsFromPlacements(others)) {
    occupied.add(`${seat.x},${seat.y}`);
  }
  return occupied;
}

export type PurchaseKind =
  | { type: 'ingredient'; ingredientId: string }
  | { type: 'equipment'; equipmentId: string }
  | { type: 'table' }
  | { type: 'grid_expansion' };

function countPlacedTables(placements: Placement[]): number {
  return placements.filter((item) => item.itemKey.startsWith('table')).length;
}

function equipmentGateOwned(state: GameState, equipmentId: string): boolean {
  return state.purchasedEquipmentIds.includes(equipmentId);
}

export function canPurchase(state: GameState, item: PurchaseKind, ctx: DomainContext): boolean {
  switch (item.type) {
    case 'ingredient': {
      const ingredient = ctx.ingredientsById.get(item.ingredientId);
      if (!ingredient) return false;
      if (state.unlockedIngredientIds.includes(item.ingredientId)) return false;
      if (!equipmentGateOwned(state, ingredient.equipmentId)) return false;
      const cost = scaledUpgradeCost(150, 1.14, state.ingredientUnlockIndex, state.prestige);
      return state.cash >= cost;
    }
    case 'equipment': {
      if (state.purchasedEquipmentIds.includes(item.equipmentId)) return false;
      const def = ctx.equipmentById.get(item.equipmentId);
      if (!def || def.purchaseIndex === null) return false;
      const purchasedGates = state.purchasedEquipmentIds.filter(
        (id) => id !== 'prep_station',
      ).length;
      const cost = scaledUpgradeCost(500, 1.18, purchasedGates, state.prestige);
      return state.cash >= cost;
    }
    case 'table': {
      const cost = scaledUpgradeCost(200, 1.12, state.tableCount, state.prestige);
      return state.cash >= cost;
    }
    case 'grid_expansion': {
      if (state.gridSize.w >= MAX_GRID_SIZE || state.gridSize.h >= MAX_GRID_SIZE) {
        return false;
      }
      const cost = scaledUpgradeCost(300, 1.15, state.gridExpansionCount, state.prestige);
      return state.cash >= cost;
    }
  }
}

export function applyPurchase(
  state: GameState,
  item: PurchaseKind,
  ctx: DomainContext,
): GameState {
  if (!canPurchase(state, item, ctx)) {
    throw new Error('Cannot afford or invalid purchase');
  }

  const next = cloneGameState(state);

  switch (item.type) {
    case 'ingredient': {
      const cost = scaledUpgradeCost(150, 1.14, state.ingredientUnlockIndex, state.prestige);
      next.cash -= cost;
      next.unlockedIngredientIds = [...next.unlockedIngredientIds, item.ingredientId];
      next.ingredientUnlockIndex += 1;
      break;
    }
    case 'equipment': {
      const purchasedGates = state.purchasedEquipmentIds.filter(
        (id) => id !== 'prep_station',
      ).length;
      const cost = scaledUpgradeCost(500, 1.18, purchasedGates, state.prestige);
      next.cash -= cost;
      next.purchasedEquipmentIds = [...next.purchasedEquipmentIds, item.equipmentId];
      break;
    }
    case 'table': {
      const cost = scaledUpgradeCost(200, 1.12, state.tableCount, state.prestige);
      next.cash -= cost;
      next.tableCount += 1;
      break;
    }
    case 'grid_expansion': {
      const cost = scaledUpgradeCost(300, 1.15, state.gridExpansionCount, state.prestige);
      next.cash -= cost;
      next.gridExpansionCount += 1;
      next.gridSize = {
        w: Math.min(MAX_GRID_SIZE, next.gridSize.w + 1),
        h: Math.min(MAX_GRID_SIZE, next.gridSize.h + 1),
      };
      break;
    }
  }

  return next;
}

export function validatePlacement(
  state: GameState,
  placement: Placement,
  existingId?: string,
): boolean {
  const { w, h } = state.gridSize;
  if (placement.x < 0 || placement.y < 0 || placement.x >= w || placement.y >= h) {
    return false;
  }
  if (isPerimeterWallCell(placement.x, placement.y, w, h)) {
    return false;
  }

  const zones = mapZonesForGrid(w, h);
  if (isTableItem(placement.itemKey) && !isDiningCell(zones, placement.x, placement.y)) {
    return false;
  }
  if (isStationItem(placement.itemKey) && !isKitchenCell(zones, placement.x, placement.y)) {
    return false;
  }

  const occupiedByOthers = occupiedCellsExcluding(state.placements, existingId);
  if (occupiedByOthers.has(`${placement.x},${placement.y}`)) {
    return false;
  }

  if (isTableItem(placement.itemKey)) {
    for (const seat of seatsFromPlacements([placement])) {
      if (seat.x < 0 || seat.y < 0 || seat.x >= w || seat.y >= h) {
        return false;
      }
      if (isPerimeterWallCell(seat.x, seat.y, w, h)) {
        return false;
      }
      if (!isDiningCell(zones, seat.x, seat.y)) {
        return false;
      }
      if (occupiedByOthers.has(`${seat.x},${seat.y}`)) {
        return false;
      }
    }
  }

  return true;
}

export function recalculateSeatingCapacity(placements: Placement[]): number {
  return seatingFromPlacements(placements);
}

export function applyPlaceItem(state: GameState, placement: Placement): GameState {
  if (!validatePlacement(state, placement)) {
    throw new Error('Invalid placement');
  }

  if (isTableItem(placement.itemKey)) {
    const placedTables = countPlacedTables(state.placements);
    if (placedTables >= state.tableCount) {
      throw new Error('No unplaced tables available');
    }
  }

  const next = cloneGameState(state);
  next.placements = [...next.placements, { ...placement, id: placement.id || nextPlacementId() }];
  next.seatingCapacity = recalculateSeatingCapacity(next.placements);
  return next;
}

export function applyRemoveItem(state: GameState, placementId: string): GameState {
  const next = cloneGameState(state);
  next.placements = next.placements.filter((item) => item.id !== placementId);
  next.seatingCapacity = recalculateSeatingCapacity(next.placements);
  return next;
}

export function applyMoveItem(
  state: GameState,
  placementId: string,
  x: number,
  y: number,
): GameState {
  const existing = state.placements.find((item) => item.id === placementId);
  if (!existing) throw new Error('Placement not found');
  const moved = { ...existing, x, y };
  if (!validatePlacement(state, moved, placementId)) {
    throw new Error('Invalid placement');
  }
  const next = cloneGameState(state);
  next.placements = next.placements.map((item) =>
    item.id === placementId ? moved : item,
  );
  next.seatingCapacity = recalculateSeatingCapacity(next.placements);
  return next;
}

export function resetRunLayout(state: GameState): GameState {
  const next = cloneGameState(state);
  next.gridSize = { ...STARTING_GRID };
  next.placements = [
    { id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
    { id: 'table_2', itemKey: 'table_2seat', x: 2, y: 0, rotation: 0 },
  ];
  next.seatingCapacity = seatingFromTableCount(2);
  next.tableCount = 2;
  next.gridExpansionCount = 0;
  return next;
}

export function isStartingEquipment(id: string): boolean {
  return (STARTING_EQUIPMENT_IDS as readonly string[]).includes(id);
}
