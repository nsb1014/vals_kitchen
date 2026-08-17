import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  clearVisualJuiceListenersForTests,
  emitVisualJuice,
  subscribeVisualJuice,
} from '../assets/visual-juice.ts';
import {
  cameraPunchMultiplier,
  clampCameraPunchScale,
} from '../canvas/coordinates.ts';
import {
  carryPlateSpriteLayout,
  facingNameFromIndex,
} from '../canvas/carry-plate-layout.ts';
import { eatingTablePlacementIds } from '../canvas/table-service-visual.ts';
import type { FloorDay } from '../domain/floor/types.ts';

describe('visual juice bus', () => {
  beforeEach(() => {
    clearVisualJuiceListenersForTests();
  });

  it('delivers serve/review/placement kinds to subscribers', () => {
    const seen: string[] = [];
    const unsub = subscribeVisualJuice((kind) => seen.push(kind));
    emitVisualJuice('serve');
    emitVisualJuice('review');
    emitVisualJuice('placement');
    unsub();
    emitVisualJuice('serve');
    expect(seen).toEqual(['serve', 'review', 'placement']);
  });
});

describe('camera punch helpers', () => {
  it('clamps punch scale within bounds', () => {
    expect(clampCameraPunchScale(2, 1.04)).toBeCloseTo(2.08);
    expect(clampCameraPunchScale(2, 10, 0.5, 3)).toBe(3);
    expect(clampCameraPunchScale(0, 1.04)).toBe(1);
  });

  it('keeps punch multiplier flat so serve never zooms the camera', () => {
    expect(cameraPunchMultiplier(-1, 150)).toBe(1);
    expect(cameraPunchMultiplier(150, 150)).toBe(1);
    expect(cameraPunchMultiplier(75, 150, 1.04)).toBe(1);
    expect(cameraPunchMultiplier(0, 150, 1.04)).toBe(1);
  });
});

describe('carry plate sprite layout', () => {
  it('matches facing offsets and up-behind sort', () => {
    const feet = { x: 100, y: 200 };
    expect(facingNameFromIndex(2)).toBe('up');
    const up = carryPlateSpriteLayout(feet, 'up');
    expect(up.visible).toBe(true);
    if (!up.visible) return;
    expect(up.plate.x).toBe(110);
    expect(up.plate.sortY).toBe(199);
    const down = carryPlateSpriteLayout(feet, 'down');
    expect(down.visible).toBe(true);
    if (!down.visible) return;
    expect(down.plate.sortY).toBe(201);
  });
});

describe('eating table steam targets', () => {
  it('returns placement ids only for eating guests', () => {
    const floor = {
      pool: [
        {
          id: 'g1',
          stage: 'eating',
          seat: { tablePlacementId: 't1', slotIndex: 0, x: 1, y: 1, facing: 0 },
          customer: { id: 'c1' },
        },
        {
          id: 'g2',
          stage: 'seated',
          seat: { tablePlacementId: 't2', slotIndex: 0, x: 2, y: 2, facing: 0 },
          customer: { id: 'c2' },
        },
      ],
    } as unknown as FloorDay;
    expect(eatingTablePlacementIds(floor)).toEqual(['t1']);
    expect(eatingTablePlacementIds(null)).toEqual([]);
  });
});

describe('EffectsLayer burst pooling', () => {
  it('spawns nothing when fx textures are missing and reports zero active', async () => {
    vi.resetModules();
    vi.doMock('../assets/loader.ts', () => ({
      getTileTexture: () => null,
    }));
    const { EffectsLayer } = await import('../canvas/layers/EffectsLayer.ts');
    const layer = new EffectsLayer();
    layer.burstServe(10, 20);
    expect(layer.getActiveCount()).toBe(0);
    layer.update(100);
    expect(layer.getActiveCount()).toBe(0);
  });
});
