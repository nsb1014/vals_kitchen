import type { Placement } from '../state/game-state.ts';
import type { FloorDay, FloorGuest } from './types.ts';

export interface GridPoint {
  x: number;
  y: number;
}

/** Chebyshev distance ≤ 1 (includes same cell and diagonals). */
export function isAdjacent(a: GridPoint, b: GridPoint): boolean {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
}

export function playerNearPlacement(
  player: GridPoint,
  placement: Placement,
  footprint = 1,
): boolean {
  for (let dy = 0; dy < footprint; dy++) {
    for (let dx = 0; dx < footprint; dx++) {
      if (isAdjacent(player, { x: placement.x + dx, y: placement.y + dy })) {
        return true;
      }
    }
  }
  return false;
}

function placementByIdMap(placements: Placement[]): Map<string, Placement> {
  return new Map(placements.map((p) => [p.id, p]));
}

function adjacentTablePlacementIds(
  floor: FloorDay,
  player: GridPoint,
  placements: Placement[],
  state: FloorDay['tables'][number]['state'],
): string[] {
  const byId = placementByIdMap(placements);
  return floor.tables
    .filter((t) => t.state === state)
    .filter((t) => {
      const placement = byId.get(t.placementId);
      return placement !== undefined && playerNearPlacement(player, placement);
    })
    .map((t) => t.placementId);
}

export function adjacentUnsetTablePlacementIds(
  floor: FloorDay,
  player: GridPoint,
  placements: Placement[],
): string[] {
  return adjacentTablePlacementIds(floor, player, placements, 'unset');
}

export function adjacentDirtyTablePlacementIds(
  floor: FloorDay,
  player: GridPoint,
  placements: Placement[],
): string[] {
  return adjacentTablePlacementIds(floor, player, placements, 'dirty');
}

const STATION_ITEM_KEYS = new Set(['prep_station']);

export function isCookStationItemKey(itemKey: string): boolean {
  return STATION_ITEM_KEYS.has(itemKey);
}

function isStationPlacement(placement: Placement): boolean {
  return isCookStationItemKey(placement.itemKey);
}

export function findCookStationPlacementAtCell(
  placements: Placement[],
  cell: GridPoint,
  footprint = 1,
): Placement | null {
  for (const placement of placements) {
    if (!isStationPlacement(placement)) continue;
    for (let dy = 0; dy < footprint; dy += 1) {
      for (let dx = 0; dx < footprint; dx += 1) {
        if (placement.x + dx === cell.x && placement.y + dy === cell.y) {
          return placement;
        }
      }
    }
  }
  return null;
}

export function playerNearStation(
  player: GridPoint,
  placements: Placement[],
): boolean {
  return placements.some(
    (p) => isStationPlacement(p) && playerNearPlacement(player, p),
  );
}

export function playerNearGuestSeat(
  player: GridPoint,
  guest: FloorGuest,
): boolean {
  if (!guest.seat) return false;
  return isAdjacent(player, guest.seat);
}

export function seatedUnorderedCustomerIds(floor: FloorDay): string[] {
  return floor.pool
    .filter((g) => g.stage === 'seated')
    .map((g) => g.customer.id);
}

export function adjacentSeatedCustomerIds(
  floor: FloorDay,
  player: GridPoint,
): string[] {
  return floor.pool
    .filter((g) => g.stage === 'seated' && playerNearGuestSeat(player, g))
    .map((g) => g.customer.id);
}
