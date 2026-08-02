import type { Placement } from '../state/game-state.ts';
import { EQUIPMENT_IDS } from '../types.ts';
import { guestServicePositions } from './interact.ts';
import { seatsFromPlacements } from './seats.ts';
import {
  isPerimeterWallCell,
  mainGuestEntranceReservedCells,
  openDoorCellsForRoom,
  servicePlayerSpawn,
} from './starter-map.ts';

const STATION_ITEM_KEYS = new Set<string>(EQUIPMENT_IDS);

function mainFloorReachability(
  gridSize: { w: number; h: number },
  placements: Placement[],
  kitchenAnnexOwned: boolean,
): {
  spawn: { x: number; y: number };
  reachable: Set<string>;
} {
  const { w, h } = gridSize;
  const blocked = new Set<string>();
  for (const placement of placements) {
    if (placement.itemKey.startsWith('table') || STATION_ITEM_KEYS.has(placement.itemKey)) {
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
  for (const cell of mainGuestEntranceReservedCells(w, h)) {
    blocked.add(`${cell.x},${cell.y}`);
  }

  const spawn = servicePlayerSpawn(w, h);
  const reachable = new Set<string>();
  if (blocked.has(`${spawn.x},${spawn.y}`)) return { spawn, reachable };
  reachable.add(`${spawn.x},${spawn.y}`);
  const queue = [spawn];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = `${x},${y}`;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (blocked.has(key) || reachable.has(key)) continue;
      reachable.add(key);
      queue.push({ x, y });
    }
  }
  return { spawn, reachable };
}

/**
 * True when Val can reach a personal-space service cell for every stool from
 * the service-day spawn. Shared by edit validation and legacy-save repair so
 * both paths enforce exactly the same core-loop invariant.
 */
export function keepsGuestServiceReachable(
  gridSize: { w: number; h: number },
  placements: Placement[],
  kitchenAnnexOwned: boolean,
): boolean {
  const seats = seatsFromPlacements(placements);
  // One flood fill answers reachability for every stool. Running a separate
  // A* per candidate made bounded legacy-layout search unnecessarily costly.
  const { spawn, reachable } = mainFloorReachability(
    gridSize,
    placements,
    kitchenAnnexOwned,
  );
  if (!reachable.has(`${spawn.x},${spawn.y}`)) return false;
  return seats.every((seat) =>
    guestServicePositions(seat).some((position) =>
      reachable.has(`${position.x},${position.y}`),
    ),
  );
}

/** Preserve a loaded main-floor position only while it remains spawn-connected. */
export function recoverMainFloorPlayerPosition(
  gridSize: { w: number; h: number },
  placements: Placement[],
  kitchenAnnexOwned: boolean,
  saved: { x: number; y: number } | undefined,
): { x: number; y: number } {
  const { spawn, reachable } = mainFloorReachability(
    gridSize,
    placements,
    kitchenAnnexOwned,
  );
  if (saved && reachable.has(`${saved.x},${saved.y}`)) return { ...saved };
  return spawn;
}
