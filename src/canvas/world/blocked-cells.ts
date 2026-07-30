import type { Placement } from '../../domain/state/game-state.ts';
import {
  openDoorCellsForRoom,
  isPerimeterWallCell,
  type FloorRoomId,
} from '../../domain/floor/starter-map.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import { EQUIPMENT_IDS } from '../../domain/types.ts';

const EQUIPMENT_ITEM_KEYS = new Set<string>(EQUIPMENT_IDS);

/** Walk-blocking cells occupied by tables and kitchen stations. */
export function blockedCellsFromPlacements(placements: Placement[]): Set<string> {
  const blocked = new Set<string>();
  for (const p of placements) {
    if (p.itemKey.startsWith('table') || EQUIPMENT_ITEM_KEYS.has(p.itemKey)) {
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
