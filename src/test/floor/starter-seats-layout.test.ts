import { describe, expect, it } from 'vitest';
import { createStarterMap } from '../../domain/floor/starter-map.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';

describe('starter service seating layout', () => {
  it('keeps two table seat pairs separated (no contiguous four-chair strip)', () => {
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

    const xs = [...byTable.values()].map((pair) => {
      const sorted = [...pair].sort((a, b) => a.x - b.x || a.y - b.y);
      return { min: sorted[0]!.x, max: sorted[1]!.x, y: sorted[0]!.y };
    });

    // Seat pairs must not merge into one unbroken horizontal run.
    const [a, b] = xs[0]!.min < xs[1]!.min ? [xs[0]!, xs[1]!] : [xs[1]!, xs[0]!];
    expect(a.max + 1).toBeLessThan(b.min);
  });
});
