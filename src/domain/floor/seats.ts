import type { Placement } from '../state/game-state.ts';
import type { SeatSlot } from './types.ts';

/** Derive chair slots from table placements. `table_2seat` → two seats south of the table cell. */
export function seatsFromPlacements(placements: Placement[]): SeatSlot[] {
  const seats: SeatSlot[] = [];
  for (const p of placements) {
    if (!p.itemKey.startsWith('table')) continue;
    const slotCount = p.itemKey.includes('4') ? 4 : 2;
    for (let i = 0; i < slotCount; i++) {
      seats.push({
        tablePlacementId: p.id,
        slotIndex: i,
        x: p.x + (i % 2),
        y: p.y + 1 + Math.floor(i / 2),
        facing: 0,
      });
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
