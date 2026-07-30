import { describe, expect, it } from 'vitest';
import { createStarterMap, doorForGrid, servicePlayerSpawn } from '../../domain/floor/starter-map.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';

describe('servicePlayerSpawn', () => {
  it('spawns south of north-wall tables and north of the waiting line', () => {
    const map = createStarterMap();
    const spawn = servicePlayerSpawn(map.gridSize.w, map.gridSize.h);
    const door = doorForGrid(map.gridSize.w, map.gridSize.h);
    const seats = seatsFromPlacements(map.placements);
    const tableYs = map.placements
      .filter((p) => p.itemKey.startsWith('table'))
      .map((p) => p.y);

    expect(spawn.x).toBe(door.x);
    expect(spawn.y).toBeLessThan(door.y - 1);
    expect(spawn.y).toBeGreaterThan(Math.max(...tableYs));
    expect(seats.every((s) => s.x !== spawn.x || s.y !== spawn.y)).toBe(true);
  });
});
