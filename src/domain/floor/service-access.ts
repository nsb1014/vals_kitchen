import type { Placement } from '../state/game-state.ts';
import { isWalkBlockingDecorItemKey } from '../economy/decor.ts';
import { EQUIPMENT_IDS } from '../types.ts';
import {
  guestServicePositions,
  waitingGuestServicePositions,
} from './interact.ts';
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

/**
 * Integer cell keys (y * w + x) for the flood-fill hot path. Legacy repair
 * evaluates keepsGuestServiceReachable tens of thousands of times on dense
 * saves; string keys were the dominant allocation/hash cost.
 */
function cellKey(x: number, y: number, w: number): number {
  return y * w + x;
}

function mainFloorPhysicalOccupancy(
  gridSize: { w: number; h: number },
  placements: Placement[],
  kitchenAnnexOwned: boolean,
): Set<number> {
  const { w, h } = gridSize;
  const blocked = new Set<number>();
  for (const placement of placements) {
    if (isWalkBlockingPlacement(placement)) {
      blocked.add(cellKey(placement.x, placement.y, w));
    }
  }
  for (const seat of seatsFromPlacements(placements)) {
    blocked.add(cellKey(seat.x, seat.y, w));
  }

  const openDoors = new Set(
    openDoorCellsForRoom('main', w, h, kitchenAnnexOwned).map((cell) =>
      cellKey(cell.x, cell.y, w),
    ),
  );
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (isPerimeterWallCell(x, y, w, h) && !openDoors.has(cellKey(x, y, w))) {
        blocked.add(cellKey(x, y, w));
      }
    }
  }

  return blocked;
}

function reachableFrom(
  gridSize: { w: number; h: number },
  blocked: ReadonlySet<number>,
  start: GridCell,
): Set<number> {
  const { w, h } = gridSize;
  const reachable = new Set<number>();
  if (start.x < 0 || start.y < 0 || start.x >= w || start.y >= h) {
    return reachable;
  }
  const startKey = cellKey(start.x, start.y, w);
  if (blocked.has(startKey)) return reachable;

  reachable.add(startKey);
  const queue = [startKey];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const cx = current % w;
    const cy = (current - cx) / w;
    for (const [dx, dy] of CARDINAL_DIRECTIONS) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const key = current + dy * w + dx;
      if (blocked.has(key) || reachable.has(key)) continue;
      reachable.add(key);
      queue.push(key);
    }
  }
  return reachable;
}

function hasReachableSeatEndpoint(
  seat: GridCell,
  reachable: ReadonlySet<number>,
  w: number,
): boolean {
  // Seats remain blocked transit cells. Guest pathfinding permits the assigned
  // seat only as its endpoint, which is equivalent to reaching one cardinal
  // neighbor and taking a final step onto the stool.
  return CARDINAL_DIRECTIONS.some(([dx, dy]) =>
    reachable.has(cellKey(seat.x + dx, seat.y + dy, w)),
  );
}

function mainFloorPlayerReachability(
  gridSize: { w: number; h: number },
  physical: ReadonlySet<number>,
): {
  spawn: GridCell;
  reachable: Set<number>;
} {
  // The shared physical occupancy is built once per validation call; the
  // player flood adds the entrance reserve on its own copy.
  const blocked = new Set(physical);
  for (const cell of mainGuestEntranceReservedCells(gridSize.w, gridSize.h)) {
    blocked.add(cellKey(cell.x, cell.y, gridSize.w));
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
  // Build the shared physical occupancy once — the player, arrival, and
  // departure floods all start from it (legacy repair calls this per DFS
  // state, so the duplicate build was the hot path's biggest constant).
  const physical = mainFloorPhysicalOccupancy(
    gridSize,
    placements,
    kitchenAnnexOwned,
  );
  const { spawn, reachable: playerReachable } = mainFloorPlayerReachability(
    gridSize,
    physical,
  );
  const w = gridSize.w;
  if (!playerReachable.has(cellKey(spawn.x, spawn.y, w))) return false;
  if (
    !seats.every((seat) =>
      guestServicePositions(seat).some((position) =>
        playerReachable.has(cellKey(position.x, position.y, w)),
      ),
    )
  ) {
    return false;
  }
  if (
    !waitingGuestServicePositions(gridSize.w, gridSize.h).some((position) =>
      playerReachable.has(cellKey(position.x, position.y, w)),
    )
  ) {
    return false;
  }
  if (seats.length === 0) return true;

  // A pair of flood fills answers both guest-route checks for every stool;
  // seats stay blocked and are admitted only as route endpoints.
  const door = doorForGrid(gridSize.w, gridSize.h);
  const waiting = guestWaitingAlcove(door);
  const arrivalReachable = reachableFrom(gridSize, physical, waiting);
  if (
    !seats.every((seat) => hasReachableSeatEndpoint(seat, arrivalReachable, w))
  ) {
    return false;
  }

  const departureBlocked = new Set(physical);
  departureBlocked.add(cellKey(waiting.x, waiting.y, w));
  const departureReachable = reachableFrom(
    gridSize,
    departureBlocked,
    guestDoorwayLane(door),
  );
  return seats.every((seat) =>
    hasReachableSeatEndpoint(seat, departureReachable, w),
  );
}

/** Preserve a loaded main-floor position only while it remains spawn-connected. */
export function recoverMainFloorPlayerPosition(
  gridSize: { w: number; h: number },
  placements: Placement[],
  kitchenAnnexOwned: boolean,
  saved: { x: number; y: number } | undefined,
): { x: number; y: number } {
  const physical = mainFloorPhysicalOccupancy(
    gridSize,
    placements,
    kitchenAnnexOwned,
  );
  const { spawn, reachable } = mainFloorPlayerReachability(gridSize, physical);
  if (saved && reachable.has(cellKey(saved.x, saved.y, gridSize.w))) {
    return { ...saved };
  }
  return spawn;
}
