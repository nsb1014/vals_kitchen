import type { Placement } from '../state/game-state.ts';
import { isWalkBlockingDecorItemKey } from '../economy/decor.ts';
import { EQUIPMENT_IDS } from '../types.ts';
import { guestServicePositions } from './interact.ts';
import { seatsFromPlacements } from './seats.ts';
import {
  doorForGrid,
  guestDoorwayLane,
  guestWaitingAlcove,
  isPerimeterWallCell,
  mainGuestEntranceReservedCells,
  openDoorCellsForRoom,
  servicePlayerSpawn,
} from './starter-map.ts';

const STATION_ITEM_KEYS = new Set<string>(EQUIPMENT_IDS);

/** Shared physical occupancy for runtime routing, edit checks, and save repair. */
export function isWalkBlockingPlacement(placement: Placement): boolean {
  return (
    placement.itemKey.startsWith('table') ||
    STATION_ITEM_KEYS.has(placement.itemKey) ||
    isWalkBlockingDecorItemKey(placement.itemKey)
  );
}

type GridCell = { x: number; y: number };

const CARDINAL_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function mainFloorPhysicalOccupancy(
  gridSize: { w: number; h: number },
  placements: Placement[],
  kitchenAnnexOwned: boolean,
): Set<string> {
  const { w, h } = gridSize;
  const blocked = new Set<string>();
  for (const placement of placements) {
    if (isWalkBlockingPlacement(placement)) {
      blocked.add(`${placement.x},${placement.y}`);
    }
  }
  for (const seat of seatsFromPlacements(placements)) blocked.add(`${seat.x},${seat.y}`);

  const openDoors = new Set(
    openDoorCellsForRoom('main', w, h, kitchenAnnexOwned).map(
      (cell) => `${cell.x},${cell.y}`,
    ),
  );
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (isPerimeterWallCell(x, y, w, h) && !openDoors.has(`${x},${y}`)) {
        blocked.add(`${x},${y}`);
      }
    }
  }

  return blocked;
}

function reachableFrom(
  gridSize: { w: number; h: number },
  blocked: ReadonlySet<string>,
  start: GridCell,
): Set<string> {
  const { w, h } = gridSize;
  const reachable = new Set<string>();
  if (blocked.has(`${start.x},${start.y}`)) return reachable;
  if (start.x < 0 || start.y < 0 || start.x >= w || start.y >= h) {
    return reachable;
  }

  reachable.add(`${start.x},${start.y}`);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const [dx, dy] of CARDINAL_DIRECTIONS) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = `${x},${y}`;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (blocked.has(key) || reachable.has(key)) continue;
      reachable.add(key);
      queue.push({ x, y });
    }
  }
  return reachable;
}

function hasReachableSeatEndpoint(
  seat: GridCell,
  reachable: ReadonlySet<string>,
): boolean {
  // Seats remain blocked transit cells. Guest pathfinding permits the assigned
  // seat only as its endpoint, which is equivalent to reaching one cardinal
  // neighbor and taking a final step onto the stool.
  return CARDINAL_DIRECTIONS.some(([dx, dy]) =>
    reachable.has(`${seat.x + dx},${seat.y + dy}`),
  );
}

function mainFloorPlayerReachability(
  gridSize: { w: number; h: number },
  placements: Placement[],
  kitchenAnnexOwned: boolean,
): {
  spawn: GridCell;
  reachable: Set<string>;
} {
  const blocked = mainFloorPhysicalOccupancy(
    gridSize,
    placements,
    kitchenAnnexOwned,
  );
  for (const cell of mainGuestEntranceReservedCells(gridSize.w, gridSize.h)) {
    blocked.add(`${cell.x},${cell.y}`);
  }
  const spawn = servicePlayerSpawn(gridSize.w, gridSize.h);
  return { spawn, reachable: reachableFrom(gridSize, blocked, spawn) };
}

/**
 * True when every route needed for table service is physically possible:
 * Val can reach a personal-space service cell from her service-day spawn;
 * arriving guests can walk from the waiting alcove to every stool; and a guest
 * can leave every stool through the doorway lane while the alcove is occupied.
 * Shared by edit validation and legacy-save repair so both paths enforce the
 * same core-loop invariants.
 */
export function keepsGuestServiceReachable(
  gridSize: { w: number; h: number },
  placements: Placement[],
  kitchenAnnexOwned: boolean,
): boolean {
  const seats = seatsFromPlacements(placements);
  const { spawn, reachable: playerReachable } = mainFloorPlayerReachability(
    gridSize,
    placements,
    kitchenAnnexOwned,
  );
  if (!playerReachable.has(`${spawn.x},${spawn.y}`)) return false;
  if (
    !seats.every((seat) =>
      guestServicePositions(seat).some((position) =>
        playerReachable.has(`${position.x},${position.y}`),
      ),
    )
  ) {
    return false;
  }
  if (seats.length === 0) return true;

  // A pair of flood fills answers both guest-route checks for every stool;
  // seats stay blocked and are admitted only as route endpoints.
  const physical = mainFloorPhysicalOccupancy(
    gridSize,
    placements,
    kitchenAnnexOwned,
  );
  const door = doorForGrid(gridSize.w, gridSize.h);
  const waiting = guestWaitingAlcove(door);
  const arrivalReachable = reachableFrom(gridSize, physical, waiting);
  if (!seats.every((seat) => hasReachableSeatEndpoint(seat, arrivalReachable))) {
    return false;
  }

  const departureBlocked = new Set(physical);
  departureBlocked.add(`${waiting.x},${waiting.y}`);
  const departureReachable = reachableFrom(
    gridSize,
    departureBlocked,
    guestDoorwayLane(door),
  );
  return seats.every((seat) =>
    hasReachableSeatEndpoint(seat, departureReachable),
  );
}

/** Preserve a loaded main-floor position only while it remains spawn-connected. */
export function recoverMainFloorPlayerPosition(
  gridSize: { w: number; h: number },
  placements: Placement[],
  kitchenAnnexOwned: boolean,
  saved: { x: number; y: number } | undefined,
): { x: number; y: number } {
  const { spawn, reachable } = mainFloorPlayerReachability(
    gridSize,
    placements,
    kitchenAnnexOwned,
  );
  if (saved && reachable.has(`${saved.x},${saved.y}`)) return { ...saved };
  return spawn;
}
