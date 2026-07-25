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

const STATION_ITEM_KEYS = new Set(['prep_station']);

function isStationPlacement(placement: Placement): boolean {
  return STATION_ITEM_KEYS.has(placement.itemKey) || !placement.itemKey.startsWith('table');
}

export function playerNearStation(player: GridPoint, placements: Placement[]): boolean {
  return placements.some(
    (p) => isStationPlacement(p) && playerNearPlacement(player, p),
  );
}

export function playerNearGuestSeat(player: GridPoint, guest: FloorGuest): boolean {
  if (!guest.seat) return false;
  return isAdjacent(player, guest.seat);
}

export function seatedUnorderedCustomerIds(floor: FloorDay): string[] {
  return floor.pool.filter((g) => g.stage === 'seated').map((g) => g.customer.id);
}
