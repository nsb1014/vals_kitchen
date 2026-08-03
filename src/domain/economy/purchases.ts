import {
  equipmentCost,
  gridExpansionCost,
  ingredientUnlockCost,
  kitchenAnnexBaseCost,
  tableCost,
} from './costs.ts';
import {
  DECOR_COSTS,
  MAX_DECOR_PLACEMENTS,
  decorPurchasedTotal,
  isDecorItemKey,
} from './decor.ts';
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
import { keepsGuestServiceReachable } from '../floor/service-access.ts';
import {
  connectingDoorForRoom,
  connectingDoorInterior,
  isDiningCell,
  isKitchenCell,
  isPerimeterWallCell,
  mainGuestEntranceReservedCells,
  mapZonesForGrid,
  otherFloorRoom,
  type FloorRoomId,
} from '../floor/starter-map.ts';
import { EQUIPMENT_IDS, STARTING_EQUIPMENT_IDS } from '../types.ts';

const EQUIPMENT_ITEM_KEYS = new Set<string>(EQUIPMENT_IDS);

function isTableItem(itemKey: string): boolean {
  return itemKey.startsWith('table');
}

function isStationItem(itemKey: string): boolean {
  return EQUIPMENT_ITEM_KEYS.has(itemKey);
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
  | { type: 'decor'; itemKey: string }
  | { type: 'grid_expansion' }
  | { type: 'kitchen_annex' };

/** One-time back-kitchen annex cost. Tunable default — PRD §6.2. */
export function kitchenAnnexCost(): number {
  return kitchenAnnexBaseCost();
}

/** Current cost for a purchase; prestige affects income, never shop prices. */
export function purchaseCost(state: GameState, item: PurchaseKind): number {
  switch (item.type) {
    case 'ingredient':
      return ingredientUnlockCost(state.ingredientUnlockIndex);
    case 'equipment': {
      const purchasedGates = state.purchasedEquipmentIds.filter(
        (id) => id !== 'prep_station',
      ).length;
      return equipmentCost(purchasedGates);
    }
    case 'table':
      return tableCost(state.tableCount);
    case 'decor':
      if (!isDecorItemKey(item.itemKey)) {
        throw new Error(`Unknown decoration: ${item.itemKey}`);
      }
      return DECOR_COSTS[item.itemKey];
    case 'grid_expansion':
      return gridExpansionCost(state.gridExpansionCount);
    case 'kitchen_annex':
      return kitchenAnnexCost();
  }
}

function countPlacedTables(placements: Placement[]): number {
  return placements.filter((item) => item.itemKey.startsWith('table')).length;
}

function countPlacedDecor(placements: Placement[]): number {
  return placements.filter((item) => isDecorItemKey(item.itemKey)).length;
}

function countPlacedDecorType(placements: Placement[], itemKey: string): number {
  return placements.filter((item) => item.itemKey === itemKey).length;
}

function equipmentGateOwned(state: GameState, equipmentId: string): boolean {
  return state.purchasedEquipmentIds.includes(equipmentId);
}

function placementsForRoom(state: GameState, room: FloorRoomId): Placement[] {
  return room === 'main' ? state.placements : state.backKitchenPlacements;
}

export function canPurchase(state: GameState, item: PurchaseKind, ctx: DomainContext): boolean {
  switch (item.type) {
    case 'ingredient': {
      const ingredient = ctx.ingredientsById.get(item.ingredientId);
      if (!ingredient) return false;
      if (state.unlockedIngredientIds.includes(item.ingredientId)) return false;
      if (!equipmentGateOwned(state, ingredient.equipmentId)) return false;
      return state.cash >= purchaseCost(state, item);
    }
    case 'equipment': {
      if (state.purchasedEquipmentIds.includes(item.equipmentId)) return false;
      const def = ctx.equipmentById.get(item.equipmentId);
      if (!def || def.purchaseIndex === null) return false;
      return state.cash >= purchaseCost(state, item);
    }
    case 'table':
      return state.cash >= purchaseCost(state, item);
    case 'decor':
      if (!isDecorItemKey(item.itemKey)) return false;
      if (decorPurchasedTotal(state.decorPurchasedCounts) >= MAX_DECOR_PLACEMENTS) {
        return false;
      }
      return state.cash >= purchaseCost(state, item);
    case 'grid_expansion': {
      const canGrowW = state.gridSize.w < MAX_GRID_SIZE;
      const canGrowH = state.gridSize.h < MAX_GRID_SIZE;
      if (!canGrowW && !canGrowH) {
        return false;
      }
      return state.cash >= purchaseCost(state, item);
    }
    case 'kitchen_annex': {
      if (state.kitchenAnnexOwned) return false;
      return state.cash >= purchaseCost(state, item);
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
  next.cash -= purchaseCost(state, item);

  switch (item.type) {
    case 'ingredient': {
      next.unlockedIngredientIds = [...next.unlockedIngredientIds, item.ingredientId];
      next.ingredientUnlockIndex += 1;
      break;
    }
    case 'equipment': {
      next.purchasedEquipmentIds = [...next.purchasedEquipmentIds, item.equipmentId];
      break;
    }
    case 'table': {
      next.tableCount += 1;
      break;
    }
    case 'decor': {
      if (!isDecorItemKey(item.itemKey)) {
        throw new Error(`Unknown decoration: ${item.itemKey}`);
      }
      next.decorPurchasedCounts[item.itemKey] += 1;
      break;
    }
    case 'grid_expansion': {
      next.gridExpansionCount += 1;
      next.gridSize = {
        w: next.gridSize.w < MAX_GRID_SIZE ? next.gridSize.w + 1 : next.gridSize.w,
        h: next.gridSize.h < MAX_GRID_SIZE ? next.gridSize.h + 1 : next.gridSize.h,
      };
      break;
    }
    case 'kitchen_annex': {
      next.kitchenAnnexOwned = true;
      // Unlocks the separate back-kitchen room + connecting door; map size unchanged.
      break;
    }
  }

  return next;
}

export function validatePlacement(
  state: GameState,
  placement: Placement,
  existingId?: string,
  room: FloorRoomId = 'main',
): boolean {
  if (room === 'back_kitchen' && !state.kitchenAnnexOwned) {
    return false;
  }

  const { w, h } = state.gridSize;
  if (placement.x < 0 || placement.y < 0 || placement.x >= w || placement.y >= h) {
    return false;
  }
  if (isPerimeterWallCell(placement.x, placement.y, w, h)) {
    return false;
  }

  const zones = mapZonesForGrid(w, h, { room });
  const reservedEntranceCells =
    room === 'main'
      ? new Set(mainGuestEntranceReservedCells(w, h).map((cell) => `${cell.x},${cell.y}`))
      : null;
  if (reservedEntranceCells?.has(`${placement.x},${placement.y}`)) {
    return false;
  }
  const isDecor = isDecorItemKey(placement.itemKey);
  if (placement.itemKey.startsWith('decor') && !isDecor) {
    return false;
  }
  if (isTableItem(placement.itemKey)) {
    if (room !== 'main') return false;
    if (!isDiningCell(zones, placement.x, placement.y)) return false;
  }
  if (isDecor) {
    if (room !== 'main') return false;
    if (!isDiningCell(zones, placement.x, placement.y)) return false;
    const movingExistingDecor =
      existingId !== undefined &&
      state.placements.some(
        (item) => item.id === existingId && isDecorItemKey(item.itemKey),
      );
    if (!movingExistingDecor && countPlacedDecor(state.placements) >= MAX_DECOR_PLACEMENTS) {
      return false;
    }
  }
  if (isStationItem(placement.itemKey) && !isKitchenCell(zones, placement.x, placement.y)) {
    return false;
  }

  const roomPlacements = placementsForRoom(state, room);
  const occupiedByOthers = occupiedCellsExcluding(roomPlacements, existingId);
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
      if (reservedEntranceCells?.has(`${seat.x},${seat.y}`)) {
        return false;
      }
      if (occupiedByOthers.has(`${seat.x},${seat.y}`)) {
        return false;
      }
    }
  }

  if (room === 'main') {
    const candidatePlacements = existingId
      ? roomPlacements.map((item) => (item.id === existingId ? placement : item))
      : [...roomPlacements, placement];
    if (
      !keepsGuestServiceReachable(
        state.gridSize,
        candidatePlacements,
        state.kitchenAnnexOwned,
      )
    ) {
      return false;
    }
  }

  return true;
}

export function recalculateSeatingCapacity(placements: Placement[]): number {
  return seatingFromPlacements(placements);
}

export function applyPlaceItem(
  state: GameState,
  placement: Placement,
  room: FloorRoomId = 'main',
): GameState {
  if (!validatePlacement(state, placement, undefined, room)) {
    throw new Error('Invalid placement');
  }

  if (isTableItem(placement.itemKey)) {
    const placedTables = countPlacedTables(state.placements);
    if (placedTables >= state.tableCount) {
      throw new Error('No unplaced tables available');
    }
  }
  if (isDecorItemKey(placement.itemKey)) {
    const placedOfType = countPlacedDecorType(state.placements, placement.itemKey);
    if (placedOfType >= state.decorPurchasedCounts[placement.itemKey]) {
      throw new Error('No unplaced decorations of this type available');
    }
  }

  const next = cloneGameState(state);
  const entry = { ...placement, id: placement.id || nextPlacementId() };
  if (room === 'main') {
    next.placements = [...next.placements, entry];
    next.seatingCapacity = recalculateSeatingCapacity(next.placements);
  } else {
    next.backKitchenPlacements = [...next.backKitchenPlacements, entry];
  }
  return next;
}

export function applyRemoveItem(state: GameState, placementId: string): GameState {
  const next = cloneGameState(state);
  const inMain = next.placements.some((item) => item.id === placementId);
  if (inMain) {
    next.placements = next.placements.filter((item) => item.id !== placementId);
    next.seatingCapacity = recalculateSeatingCapacity(next.placements);
  } else {
    next.backKitchenPlacements = next.backKitchenPlacements.filter(
      (item) => item.id !== placementId,
    );
  }
  return next;
}

export function applyMoveItem(
  state: GameState,
  placementId: string,
  x: number,
  y: number,
  room: FloorRoomId = 'main',
): GameState {
  const roomPlacements = placementsForRoom(state, room);
  const existing = roomPlacements.find((item) => item.id === placementId);
  if (!existing) throw new Error('Placement not found');
  const moved = { ...existing, x, y };
  if (!validatePlacement(state, moved, placementId, room)) {
    throw new Error('Invalid placement');
  }
  const next = cloneGameState(state);
  if (room === 'main') {
    next.placements = next.placements.map((item) =>
      item.id === placementId ? moved : item,
    );
    next.seatingCapacity = recalculateSeatingCapacity(next.placements);
  } else {
    next.backKitchenPlacements = next.backKitchenPlacements.map((item) =>
      item.id === placementId ? moved : item,
    );
  }
  return next;
}

/** First free kitchen cell near the connecting-door interior for a room transfer. */
export function findTransferDropCell(
  state: GameState,
  targetRoom: FloorRoomId,
): { x: number; y: number } | null {
  if (targetRoom === 'back_kitchen' && !state.kitchenAnnexOwned) return null;
  const { w, h } = state.gridSize;
  const preferred = connectingDoorInterior(targetRoom, w, h);
  const zones = mapZonesForGrid(w, h, { room: targetRoom });
  const occupied = occupiedCellsExcluding(placementsForRoom(state, targetRoom));

  const candidates: { x: number; y: number }[] = [preferred];
  for (let radius = 1; radius < Math.max(w, h); radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        candidates.push({ x: preferred.x + dx, y: preferred.y + dy });
      }
    }
  }

  for (const cell of candidates) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= w || cell.y >= h) continue;
    if (isPerimeterWallCell(cell.x, cell.y, w, h)) continue;
    if (!isKitchenCell(zones, cell.x, cell.y)) continue;
    if (occupied.has(`${cell.x},${cell.y}`)) continue;
    return cell;
  }
  return null;
}

/**
 * Move a station from one room to the other (door-drop transfer).
 * Tables cannot leave the main floor.
 */
export function applyTransferItemRoom(
  state: GameState,
  placementId: string,
  fromRoom: FloorRoomId,
  toRoom: FloorRoomId,
  x: number,
  y: number,
): GameState {
  if (fromRoom === toRoom) {
    return applyMoveItem(state, placementId, x, y, fromRoom);
  }
  if (!state.kitchenAnnexOwned) {
    throw new Error('Back kitchen not unlocked');
  }
  const source = placementsForRoom(state, fromRoom).find((p) => p.id === placementId);
  if (!source) throw new Error('Placement not found');
  if (isTableItem(source.itemKey)) {
    throw new Error('Tables cannot transfer to the back kitchen');
  }

  const withoutSource = cloneGameState(state);
  if (fromRoom === 'main') {
    withoutSource.placements = withoutSource.placements.filter((p) => p.id !== placementId);
  } else {
    withoutSource.backKitchenPlacements = withoutSource.backKitchenPlacements.filter(
      (p) => p.id !== placementId,
    );
  }

  const moved = { ...source, x, y };
  if (!validatePlacement(withoutSource, moved, undefined, toRoom)) {
    throw new Error('Invalid placement');
  }

  const next = withoutSource;
  if (toRoom === 'main') {
    next.placements = [...next.placements, moved];
    next.seatingCapacity = recalculateSeatingCapacity(next.placements);
  } else {
    next.backKitchenPlacements = [...next.backKitchenPlacements, moved];
  }
  return next;
}

/** True when the cell is the connecting door on the active room (transfer / navigate target). */
export function isConnectingDoorCell(
  state: GameState,
  room: FloorRoomId,
  x: number,
  y: number,
): boolean {
  const door = connectingDoorForRoom(room, state.gridSize.w, state.gridSize.h, state.kitchenAnnexOwned);
  return door !== null && door.x === x && door.y === y;
}

export function resetRunLayout(state: GameState): GameState {
  const next = cloneGameState(state);
  next.gridSize = { ...STARTING_GRID };
  next.placements = [
    { id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
    { id: 'table_2', itemKey: 'table_2seat', x: 2, y: 0, rotation: 0 },
  ];
  next.backKitchenPlacements = [];
  next.seatingCapacity = seatingFromTableCount(2);
  next.tableCount = 2;
  next.gridExpansionCount = 0;
  next.kitchenAnnexOwned = false;
  return next;
}

export function isStartingEquipment(id: string): boolean {
  return (STARTING_EQUIPMENT_IDS as readonly string[]).includes(id);
}

export {
  DECOR_COSTS,
  DECOR_ITEM_KEYS,
  MAX_DECOR_PLACEMENTS,
  type DecorItemKey,
} from './decor.ts';
export { isStationItem, otherFloorRoom, placementsForRoom };
