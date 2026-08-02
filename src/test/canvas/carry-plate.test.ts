import { describe, expect, it } from 'vitest';
import { carryPlateGeometry } from '../../canvas/world/carry-plate.ts';

describe('carryPlateGeometry', () => {
  const feet = { x: 100, y: 200 };

  it('shows a side-peeking plate behind the cook when facing up', () => {
    const geo = carryPlateGeometry(feet, 'up');
    expect(geo.visible).toBe(true);
    if (!geo.visible) return;
    expect(geo.plate.x).toBeGreaterThan(feet.x);
    expect(geo.plate.y).toBeGreaterThanOrEqual(feet.y - 20);
    expect(geo.sortY).toBeLessThan(feet.y);
  });

  it('holds the plate in front of the torso when facing down', () => {
    const geo = carryPlateGeometry(feet, 'down');
    expect(geo.visible).toBe(true);
    if (!geo.visible) return;
    expect(geo.plate.color).toBe(0xf5e6c8);
    expect(geo.food.color).toBe(0xc45c26);
    // Hands / mid-torso band — not above the head (~feetY-32).
    expect(geo.plate.y).toBeGreaterThanOrEqual(feet.y - 20);
    expect(geo.plate.y).toBeLessThanOrEqual(feet.y - 8);
    expect(geo.plate.x).toBe(feet.x);
    // Draw in front of the body sprite.
    expect(geo.sortY).toBeGreaterThan(feet.y);
  });

  it('offsets the plate to the held side for left and right facing', () => {
    const right = carryPlateGeometry(feet, 'right');
    const left = carryPlateGeometry(feet, 'left');
    expect(right.visible).toBe(true);
    expect(left.visible).toBe(true);
    if (!right.visible || !left.visible) return;
    expect(right.plate.x).toBeGreaterThan(feet.x);
    expect(left.plate.x).toBeLessThan(feet.x);
    expect(right.sortY).toBeGreaterThan(feet.y);
    expect(left.sortY).toBeGreaterThan(feet.y);
    expect(right.plate.y).toBeGreaterThanOrEqual(feet.y - 20);
    expect(left.plate.y).toBeGreaterThanOrEqual(feet.y - 20);
  });
});
