import type { Placement } from '../state/game-state.ts';
import { EQUIPMENT_IDS } from '../types.ts';
import type { FloorDay, FloorGuest } from './types.ts';
import {
  doorForGrid,
  guestWaitingAlcove,
  isPerimeterWallCell,
  mainGuestEntranceReservedCells,
} from './starter-map.ts';

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

const STATION_ITEM_KEYS = new Set<string>(EQUIPMENT_IDS);

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
  return guestServicePositions(guest.seat).some(
    (position) => position.x === player.x && position.y === player.y,
  );
}

/**
 * Service positions around a seated guest, ordered left/right then vertical.
 * Chibi actors are almost two tiles tall but less than one tile wide, so a
 * one-cell vertical neighbor visibly stacks their bodies. Horizontal neighbors
 * remain natural; vertical approaches keep a two-cell personal-space gap.
 */
export function guestServicePositions(seat: GridPoint): GridPoint[] {
  return [
    { x: seat.x - 1, y: seat.y },
    { x: seat.x + 1, y: seat.y },
    { x: seat.x, y: seat.y - 2 },
    { x: seat.x, y: seat.y + 2 },
  ];
}

/**
 * Canonical places from which Val may greet the guest waiting beside the main
 * entrance. Keep this geometry shared by the canvas affordance, selectors, and
 * reducer so a remote UI request can never bypass the physical floor rule.
 */
export function waitingGuestServicePositions(
  gridW: number,
  gridH: number,
): GridPoint[] {
  const waiting = guestWaitingAlcove(doorForGrid(gridW, gridH));
  const reserved = new Set(
    mainGuestEntranceReservedCells(gridW, gridH).map(
      (position) => `${position.x},${position.y}`,
    ),
  );
  const candidates = [
    { x: waiting.x - 1, y: waiting.y },
    { x: waiting.x + 1, y: waiting.y },
    { x: waiting.x, y: waiting.y - 1 },
    { x: waiting.x, y: waiting.y + 1 },
    { x: waiting.x - 1, y: waiting.y - 1 },
    { x: waiting.x + 1, y: waiting.y - 1 },
    { x: waiting.x - 1, y: waiting.y + 1 },
    { x: waiting.x + 1, y: waiting.y + 1 },
  ];

  return candidates.filter(
    (position) =>
      position.x >= 0 &&
      position.y >= 0 &&
      position.x < gridW &&
      position.y < gridH &&
      !isPerimeterWallCell(position.x, position.y, gridW, gridH) &&
      !reserved.has(`${position.x},${position.y}`),
  );
}

export function playerNearWaitingGuest(
  player: GridPoint,
  gridW: number,
  gridH: number,
): boolean {
  return waitingGuestServicePositions(gridW, gridH).some(
    (position) => position.x === player.x && position.y === player.y,
  );
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
