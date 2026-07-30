import { describe, expect, it } from 'vitest';
import {
  STATION_DRAW_WIDTH_PX,
  TABLE_DRAW_WIDTH_PX,
  chairDepthY,
  furnitureDepthY,
  furnitureDrawOffset,
  furnitureDrawSize,
  seatedActorDepthY,
} from '../../canvas/furniture-fit.ts';

describe('furniture feet align', () => {
  it('places station art with feet on tile bottom', () => {
    const { w, h } = furnitureDrawSize({ width: 64, height: 96 }, 'prep_station');
    expect(w).toBe(STATION_DRAW_WIDTH_PX);
    expect(h).toBe(54);
    const o = furnitureDrawOffset(w, h);
    expect(o.x).toBe((32 - STATION_DRAW_WIDTH_PX) / 2);
    expect(o.y).toBe(32 - 54);
  });

  it('gives tables more visual weight than chairs', () => {
    const { w, h } = furnitureDrawSize({ width: 64, height: 96 }, 'table_2seat');
    expect(w).toBe(TABLE_DRAW_WIDTH_PX);
    expect(h).toBe(66);
  });

  it('sorts chair behind table behind seated guest so diners stay visible', () => {
    const seatedFeetY = 94;
    const tableY = furnitureDepthY(2);
    expect(chairDepthY(seatedFeetY)).toBeLessThan(tableY);
    expect(tableY).toBeLessThan(seatedActorDepthY(seatedFeetY, tableY));
  });
});
