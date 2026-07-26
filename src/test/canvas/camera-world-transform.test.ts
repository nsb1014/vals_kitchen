import { describe, expect, it } from 'vitest';
import { TILE_PX, computeGridScale } from '../../canvas/coordinates.ts';
import {
  computeFollowTarget,
  worldTransformFromCamera,
} from '../../canvas/systems/Camera.ts';

describe('camera world transform', () => {
  it('applies pan so world position matches screenToWorld math', () => {
    const transform = worldTransformFromCamera({
      x: 40,
      y: 16,
      scale: 2,
      stageOffsetX: 10,
      stageOffsetY: 8,
    });
    expect(transform).toEqual({
      x: 10 - 40 * 2,
      y: 8 - 16 * 2,
      scale: 2,
    });
  });

  it('refits integer scale while following on a tall desktop viewport', () => {
    const mapWpx = 10 * TILE_PX;
    const mapHpx = 8 * TILE_PX;
    const viewW = 1280;
    const viewH = 720;
    const expectedScale = computeGridScale(10, 8, viewW, viewH);
    expect(expectedScale).toBeGreaterThan(1);

    const target = computeFollowTarget(
      { x: 0, y: 0, scale: 1, stageOffsetX: 0, stageOffsetY: 0 },
      mapWpx / 2,
      mapHpx / 2,
      viewW,
      viewH,
      mapWpx,
      mapHpx,
    );
    expect(target.scale).toBe(expectedScale);
  });
});
