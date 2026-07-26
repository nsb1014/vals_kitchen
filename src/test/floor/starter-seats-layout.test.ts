import { describe, expect, it } from 'vitest';
import { createStarterMap } from '../../domain/floor/starter-map.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';

describe('starter service seating layout', () => {
  it('keeps two table seat pairs on separate table columns (no merged chair strip)', () => {
    const map = createStarterMap();
    const seats = seatsFromPlacements(map.placements);
    expect(seats).toHaveLength(4);

    const byTable = new Map<string, typeof seats>();
    for (const seat of seats) {
      const list = byTable.get(seat.tablePlacementId) ?? [];
      list.push(seat);
      byTable.set(seat.tablePlacementId, list);
    }
    expect(byTable.size).toBe(2);

    const columns = [...byTable.values()].map((pair) => {
      expect(pair.every((s) => s.x === pair[0]!.x && s.y === pair[0]!.y)).toBe(true);
      expect(pair.every((s) => s.facing === 180)).toBe(true);
      return pair[0]!.x;
    });

    columns.sort((a, b) => a - b);
    // Distinct table columns with at least one empty column between them.
    expect(columns[0]! + 1).toBeLessThan(columns[1]!);
  });
});
