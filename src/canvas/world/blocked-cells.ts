import type { Placement } from '../../domain/state/game-state.ts';
import {
  mainGuestEntranceReservedCells,
  openDoorCellsForRoom,
  isPerimeterWallCell,
  type FloorRoomId,
} from '../../domain/floor/starter-map.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import { isWalkBlockingPlacement } from '../../domain/floor/service-access.ts';

/** Walk-blocking cells occupied by real raised furniture. Rugs stay passable. */
export function blockedCellsFromPlacements(placements: Placement[]): Set<string> {
  const blocked = new Set<string>();
  for (const p of placements) {
    if (isWalkBlockingPlacement(p)) {
      blocked.add(`${p.x},${p.y}`);
    }
  }
  return blocked;
}

export interface WalkBlockOptions {
  kitchenAnnexOwned?: boolean;
  room?: FloorRoomId;
  /** When false, chair/seat cells stay walkable (tests / edit preview). Default true. */
  blockSeats?: boolean;
}

/**
 * Full floor walkability mask: furniture, chair seats, and perimeter walls.
 * Guest door (main) and connecting door (when annex unlocked) stay open.
 * Guests may still path onto a seat via findPath({ allowBlockedEndpoints: true }).
 */
export function walkBlockedCells(
  placements: Placement[],
  gridW: number,
  gridH: number,
  opts: WalkBlockOptions = {},
): Set<string> {
  const room = opts.room ?? 'main';
  const kitchenAnnexOwned = Boolean(opts.kitchenAnnexOwned);
  const blockSeats = opts.blockSeats !== false;
  const blocked = blockedCellsFromPlacements(placements);
  if (blockSeats) {
    for (const seat of seatsFromPlacements(placements)) {
      if (seat.x < 0 || seat.y < 0 || seat.x >= gridW || seat.y >= gridH) continue;
      blocked.add(`${seat.x},${seat.y}`);
    }
  }
  const openDoors = openDoorCellsForRoom(room, gridW, gridH, kitchenAnnexOwned);
  const open = new Set(openDoors.map((d) => `${d.x},${d.y}`));
  for (let y = 0; y < gridH; y += 1) {
    for (let x = 0; x < gridW; x += 1) {
      if (!isPerimeterWallCell(x, y, gridW, gridH)) continue;
      if (open.has(`${x},${y}`)) continue;
      blocked.add(`${x},${y}`);
    }
  }
  return blocked;
}

/**
 * Player-only walk mask. Guest locomotion must retain access to the entrance,
 * while Val routes around the waiting alcove and the exclusive door lane.
 * A legacy/resumed origin inside the reservation is exempted so Val can leave.
 */
export function playerWalkBlockedCells(
  placements: Placement[],
  gridW: number,
  gridH: number,
  opts: WalkBlockOptions = {},
  current?: { x: number; y: number },
): Set<string> {
  const blocked = walkBlockedCells(placements, gridW, gridH, opts);
  if ((opts.room ?? 'main') === 'main') {
    const reserved = mainGuestEntranceReservedCells(gridW, gridH);
    const currentIsReserved =
      current && reserved.some((cell) => cell.x === current.x && cell.y === current.y);
    // Legacy saves may resume Val inside this newly reserved corridor. Keep
    // the whole three-cell route open until she steps out, guaranteeing an
    // egress through the guest door even if both interior neighbors are full.
    if (!currentIsReserved) {
      for (const cell of reserved) {
        blocked.add(`${cell.x},${cell.y}`);
      }
    }
  }
  if (current) blocked.delete(`${current.x},${current.y}`);
  return blocked;
}
