import { describe, expect, it } from 'vitest';
import {
  TABLE_DRAW_WIDTH_PX,
  chairDepthY,
  furnitureDepthY,
  furnitureDrawOffset,
  furnitureDrawSize,
} from '../../canvas/furniture-fit.ts';

describe('furniture feet align', () => {
  it('places 32x48 art with feet on tile bottom', () => {
    const { w, h } = furnitureDrawSize({ width: 32, height: 48 });
    expect(w).toBe(32);
    expect(h).toBe(48);
    const o = furnitureDrawOffset(w, h);
    expect(o.x).toBe(0);
    expect(o.y).toBe(-16); // TILE_PX 32 - 48
  });

  it('gives tables more visual weight than chairs', () => {
    const { w, h } = furnitureDrawSize({ width: 64, height: 96 }, 'table_2seat');
    expect(w).toBe(TABLE_DRAW_WIDTH_PX);
    expect(h).toBe(60);
  });

  it('sorts chair behind seated guest behind the table lip', () => {
    const seatedFeetY = 94;
    expect(chairDepthY(seatedFeetY)).toBeLessThan(seatedFeetY);
    expect(seatedFeetY).toBeLessThan(furnitureDepthY(2));
  });
});
