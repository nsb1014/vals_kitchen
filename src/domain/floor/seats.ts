import type { Placement } from '../state/game-state.ts';
import type { SeatSlot } from './types.ts';

/**
 * Derive chair slots from table placements.
 * 2-tops: both south seats share the cell under the table (flank via render offsets), facing 180 (toward table).
 * 4-tops: south pair + north pair around the table cell.
 */
export function seatsFromPlacements(placements: Placement[]): SeatSlot[] {
  const seats: SeatSlot[] = [];
  for (const p of placements) {
    if (!p.itemKey.startsWith('table')) continue;
    const slotCount = p.itemKey.includes('4') ? 4 : 2;
    if (slotCount === 2) {
      seats.push(
        { tablePlacementId: p.id, slotIndex: 0, x: p.x, y: p.y + 1, facing: 180 },
        { tablePlacementId: p.id, slotIndex: 1, x: p.x, y: p.y + 1, facing: 180 },
      );
      continue;
    }
    // 4-top: south pair (facing up) then north pair (facing down).
    seats.push(
      { tablePlacementId: p.id, slotIndex: 0, x: p.x, y: p.y + 1, facing: 180 },
      { tablePlacementId: p.id, slotIndex: 1, x: p.x, y: p.y + 1, facing: 180 },
      { tablePlacementId: p.id, slotIndex: 2, x: p.x, y: Math.max(0, p.y - 1), facing: 0 },
      { tablePlacementId: p.id, slotIndex: 3, x: p.x, y: Math.max(0, p.y - 1), facing: 0 },
    );
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
