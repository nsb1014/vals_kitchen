import { describe, expect, it } from 'vitest';
import { carryPlateGeometry } from '../../canvas/world/ActorLayer.ts';

describe('carryPlateGeometry', () => {
  it('places a cream plate + food accent above player feet', () => {
    const geo = carryPlateGeometry({ x: 100, y: 200 });
    expect(geo.plate.color).toBe(0xf5e6c8);
    expect(geo.food.color).toBe(0xc45c26);
    expect(geo.plate.y).toBeGreaterThanOrEqual(200 - 36);
    expect(geo.plate.y).toBeLessThanOrEqual(200 - 28);
    expect(geo.plate.x).toBe(100);
    expect(geo.food.x).toBe(100);
  });
});
