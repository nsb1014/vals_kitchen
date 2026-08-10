import { describe, expect, it } from 'vitest';
import {
  NavController,
  easeSegmentProgress,
} from '../../canvas/world/NavController.ts';
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

  it('eases segment world lerp without changing tile timing', () => {
    expect(easeSegmentProgress(0)).toBe(0);
    expect(easeSegmentProgress(1)).toBe(1);
    expect(easeSegmentProgress(0.5)).toBe(0.5);
    // Early segment lag vs linear; late segment lead — Dead Cells weight.
    expect(easeSegmentProgress(0.25)).toBeLessThan(0.25);
    expect(easeSegmentProgress(0.75)).toBeGreaterThan(0.75);
    // Mid-path corners stay linear so turns keep momentum.
    expect(easeSegmentProgress(0.25, 'mid')).toBe(0.25);
    expect(easeSegmentProgress(0.75, 'mid')).toBe(0.75);

    const nav = new NavController({ x: 0, y: 0 }, 10);
    nav.setPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    nav.update(25); // progress 0.25
    const linearX = TILE_PX / 2 + TILE_PX * 0.25;
    expect(nav.worldX).toBeLessThan(linearX);
    expect(nav.position).toEqual({ x: 0, y: 0 });
    // Full tile duration still completes in 100ms at 10 tiles/s.
    nav.update(75);
    expect(nav.isMoving).toBe(false);
    expect(nav.position).toEqual({ x: 1, y: 0 });
  });

  it('keeps mid-path corners linear so turns do not full-stop', () => {
    const nav = new NavController({ x: 0, y: 0 }, 10);
    nav.setPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
    // Advance into the middle segment (index 1 of 3).
    nav.update(100);
    expect(nav.position).toEqual({ x: 1, y: 0 });
    nav.update(50); // halfway through mid segment — linear ease
    expect(nav.worldY).toBeCloseTo(TILE_PX / 2 + TILE_PX * 0.5);
  });

  it('buffers a mid-walk goal until the active path ends', () => {
    const nav = new NavController({ x: 0, y: 0 }, 10);
    nav.setPath([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    nav.update(50);
    expect(nav.isMoving).toBe(true);
    nav.bufferGoal({ x: 2, y: 2 });
    expect(nav.bufferedDestination).toEqual({ x: 2, y: 2 });
    // Finish current path without auto-starting the buffer (caller repaths).
    nav.update(200);
    expect(nav.isMoving).toBe(false);
    expect(nav.position).toEqual({ x: 2, y: 0 });
    expect(nav.consumeBufferedGoal()).toEqual({ x: 2, y: 2 });
    expect(nav.bufferedDestination).toBeNull();
  });

  it('exposes path-tail crumbs while moving', () => {
    const nav = new NavController({ x: 0, y: 0 }, 10);
    nav.setPath([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    nav.update(10);
    const crumbs = nav.pathTailCrumbs(3);
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]!.x).toBeGreaterThan(nav.worldX);
    expect(crumbs.every((c) => c.y === nav.worldY)).toBe(true);
  });

  it('returns through the neutral pose between opposite strides', () => {
    const nav = new NavController({ x: 0, y: 0 }, 4);
    nav.setPath([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);

    expect(nav.walkFrame()).toBe(0);
    nav.update(62.5);
    expect(nav.walkFrame()).toBe(1);
    nav.update(62.5);
    expect(nav.walkFrame()).toBe(0);
    nav.update(62.5);
    expect(nav.walkFrame()).toBe(2);
    nav.update(62.5);
    expect(nav.walkFrame()).toBe(0);
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

  it('exposes destination while path is active', () => {
    const nav = new NavController({ x: 0, y: 0 }, 2);
    nav.setPath([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(nav.destination).toEqual({ x: 3, y: 0 });
    for (let i = 0; i < 20; i += 1) nav.update(100);
    expect(nav.isMoving).toBe(false);
    expect(nav.destination).toBeNull();
  });

  it('keeps world position when repathing from the same cell', () => {
    const nav = new NavController({ x: 0, y: 0 }, 10);
    nav.setPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    nav.update(50);
    const midX = nav.worldX;
    nav.setPath([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ]);
    expect(nav.worldX).toBeCloseTo(midX);
    expect(nav.facing).toBe(1); // down
  });

  it('does not snap back to the from-cell center on the first tick after repath', () => {
    const nav = new NavController({ x: 0, y: 0 }, 10);
    nav.setPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    nav.update(50); // halfway across the first segment
    const midX = nav.worldX;
    const midY = nav.worldY;
    nav.setPath([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ]);
    // Tiny tick must continue from the preserved mid-tile world position,
    // not rewrite it back to the from-cell center (which looks like a jump).
    nav.update(1);
    expect(Math.abs(nav.worldX - midX)).toBeLessThan(TILE_PX * 0.15);
    expect(Math.abs(nav.worldY - midY)).toBeLessThan(TILE_PX * 0.15);
    expect(nav.worldX).not.toBeCloseTo(TILE_PX / 2, 0);
  });
});
