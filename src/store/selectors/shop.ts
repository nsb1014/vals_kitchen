import type { GameState } from '../../domain/state/game-state.ts';
import { nextPlacementId } from '../../domain/state/game-state.ts';
import type { GameStore } from '../game-store.ts';

export interface UnplacedItem {
  itemKey: string;
  label: string;
  kind: 'table' | 'equipment';
}

function countPlacedTables(placements: GameState['placements']): number {
  return placements.filter((item) => item.itemKey.startsWith('table')).length;
}

function placedEquipmentIds(placements: GameState['placements']): Set<string> {
  const ids = new Set<string>();
  for (const placement of placements) {
    if (!placement.itemKey.startsWith('table') && !placement.itemKey.startsWith('decor')) {
      ids.add(placement.itemKey);
    }
  }
  return ids;
}

export function selectUnplacedItems(
  state: GameStore,
  equipmentNameById: Map<string, string>,
): UnplacedItem[] {
  const items: UnplacedItem[] = [];
  const placedTables = countPlacedTables(state.placements);
  const unplacedTables = state.tableCount - placedTables;
  for (let i = 0; i < unplacedTables; i++) {
    items.push({
      itemKey: 'table_2seat',
      label: 'Table (2 seats)',
      kind: 'table',
    });
  }

  const placed = placedEquipmentIds([
    ...state.placements,
    ...state.backKitchenPlacements,
  ]);
  for (const equipmentId of state.purchasedEquipmentIds) {
    if (placed.has(equipmentId)) continue;
    items.push({
      itemKey: equipmentId,
      label: equipmentNameById.get(equipmentId) ?? equipmentId,
      kind: 'equipment',
    });
  }

  return items;
}

export function findFirstOpenTile(state: GameState): { x: number; y: number } | null {
  const occupied = new Set(state.placements.map((item) => `${item.x},${item.y}`));
  for (let y = 0; y < state.gridSize.h; y++) {
    for (let x = 0; x < state.gridSize.w; x++) {
      if (!occupied.has(`${x},${y}`)) {
        return { x, y };
      }
    }
  }
  return null;
}

export function buildPlacementForItem(
  state: GameState,
  itemKey: string,
): { id: string; itemKey: string; x: number; y: number; rotation: number } | null {
  const tile = findFirstOpenTile(state);
  if (!tile) return null;
  return {
    id: nextPlacementId(),
    itemKey,
    x: tile.x,
    y: tile.y,
    rotation: 0,
  };
}
