import { describe, expect, it } from 'vitest';
import {
  createStarterMap,
  isDiningCell,
  isPerimeterWallCell,
} from '../../domain/floor/starter-map.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';

describe('starter service seating layout', () => {
  it('keeps two table seat pairs on separate side columns (no south chair strip)', () => {
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

    for (const pair of byTable.values()) {
      expect(pair).toHaveLength(2);
      expect(pair.map((s) => s.facing).sort((a, b) => a - b)).toEqual([90, 270]);
      expect(pair.every((s) => s.y === pair[0]!.y)).toBe(true);
      const xs = pair.map((s) => s.x).sort((a, b) => a - b);
      expect(xs[1]! - xs[0]!).toBe(2); // west and east with table between
    }

    const tableXs = map.placements
      .filter((p) => p.itemKey.startsWith('table'))
      .map((p) => p.x)
      .sort((a, b) => a - b);
    expect(tableXs[0]! + 1).toBeLessThan(tableXs[1]!);
  });

  it('keeps every starter seat on open dining floor (not in perimeter walls)', () => {
    const map = createStarterMap();
    const { w, h } = map.gridSize;
    const seats = seatsFromPlacements(map.placements);
    expect(seats.length).toBeGreaterThan(0);

    for (const seat of seats) {
      expect(isPerimeterWallCell(seat.x, seat.y, w, h)).toBe(false);
      expect(isDiningCell(map.zones, seat.x, seat.y)).toBe(true);
    }

    // Seat cells must not collide with each other or with table footprints.
    const occupied = new Set(
      map.placements.filter((p) => p.itemKey.startsWith('table')).map((p) => `${p.x},${p.y}`),
    );
    for (const seat of seats) {
      const key = `${seat.x},${seat.y}`;
      expect(occupied.has(key)).toBe(false);
      occupied.add(key);
    }
  });
});
