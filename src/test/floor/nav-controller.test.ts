import { describe, expect, it } from 'vitest';
import { NavController } from '../../canvas/world/NavController.ts';
import { TILE_PX } from '../../canvas/coordinates.ts';

describe('NavController', () => {
  it('advances along path cells over time', () => {
    const nav = new NavController({ x: 0, y: 0 }, 10);
    nav.setPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    nav.update(100); // 1 tile at 10 tiles/s
    expect(nav.position).toEqual({ x: 1, y: 0 });
    nav.update(100);
    expect(nav.position).toEqual({ x: 2, y: 0 });
    expect(nav.isMoving).toBe(false);
  });

  it('lerps world position within a segment', () => {
    const nav = new NavController({ x: 0, y: 0 }, 10);
    nav.setPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    nav.update(50); // half a tile
    expect(nav.position).toEqual({ x: 0, y: 0 });
    expect(nav.isMoving).toBe(true);
    expect(nav.worldX).toBeCloseTo(TILE_PX / 2 + TILE_PX / 2); // midway centers
    expect(nav.worldY).toBeCloseTo(TILE_PX / 2);
    expect(nav.facing).toBe(0); // right
    expect(nav.walkFrame()).toBeGreaterThanOrEqual(0);
  });

  it('snapTo clears path and centers on the cell', () => {
    const nav = new NavController({ x: 0, y: 0 }, 10);
    nav.setPath([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    nav.snapTo({ x: 3, y: 4 });
    expect(nav.isMoving).toBe(false);
    expect(nav.position).toEqual({ x: 3, y: 4 });
    expect(nav.worldX).toBe(3 * TILE_PX + TILE_PX / 2);
    expect(nav.worldY).toBe(4 * TILE_PX + TILE_PX / 2);
  });
});
