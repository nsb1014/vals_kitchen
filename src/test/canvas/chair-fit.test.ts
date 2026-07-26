import { describe, expect, it } from 'vitest';
import { TILE_PX } from '../../canvas/coordinates.ts';
import { chairDrawFit } from '../../canvas/furniture-fit.ts';

describe('chair draw fit', () => {
  it('keeps 32x48 chairs from extending a full tile into the cell above', () => {
    const fit = chairDrawFit({ width: 32, height: 48 });
    expect(fit.w).toBeLessThanOrEqual(TILE_PX);
    expect(fit.h).toBeLessThanOrEqual(TILE_PX + 8);
    expect(fit.y).toBeGreaterThanOrEqual(-8);
    expect(fit.y + fit.h).toBe(TILE_PX);
  });
});
