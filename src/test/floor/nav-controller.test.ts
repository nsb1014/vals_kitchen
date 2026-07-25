import { describe, expect, it } from 'vitest';
import { NavController } from '../../canvas/world/NavController.ts';

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
});
