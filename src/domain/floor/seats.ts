import type { Placement } from '../state/game-state.ts';
import type { SeatSlot } from './types.ts';

/**
 * Derive chair slots from table placements.
 * 2-tops: west + east of the table footprint, facing inward (¾ diner sides).
 * 4-tops: west, east, south, north around the table cell.
 */
export function seatsFromPlacements(placements: Placement[]): SeatSlot[] {
  const seats: SeatSlot[] = [];
  for (const p of placements) {
    if (!p.itemKey.startsWith('table')) continue;
    const slotCount = p.itemKey.includes('4') ? 4 : 2;
    // West of table, face east (90); east of table, face west (270).
    seats.push(
      { tablePlacementId: p.id, slotIndex: 0, x: p.x - 1, y: p.y, facing: 90 },
      { tablePlacementId: p.id, slotIndex: 1, x: p.x + 1, y: p.y, facing: 270 },
    );
    if (slotCount === 4) {
      seats.push(
        { tablePlacementId: p.id, slotIndex: 2, x: p.x, y: p.y + 1, facing: 180 },
        { tablePlacementId: p.id, slotIndex: 3, x: p.x, y: Math.max(0, p.y - 1), facing: 0 },
      );
    }
  }
  return seats;
}

/** Assign `partySize` seats on one table, or null if not enough slots on that table. */
export function assignPartyToTable(
  seats: SeatSlot[],
  tablePlacementId: string,
  partySize: number,
): SeatSlot[] | null {
  const onTable = seats
    .filter((s) => s.tablePlacementId === tablePlacementId)
    .sort((a, b) => a.slotIndex - b.slotIndex);
  if (onTable.length < partySize) return null;
  return onTable.slice(0, partySize);
}
