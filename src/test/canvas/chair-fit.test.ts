import { describe, expect, it } from 'vitest';
import { TILE_PX } from '../../canvas/coordinates.ts';
import {
  CHAIR_DRAW_HEIGHT_PX,
  CHAIR_DRAW_WIDTH_PX,
  chairDrawFit,
} from '../../canvas/furniture-fit.ts';

describe('chair draw fit', () => {
  it('keeps chairs subordinate to the table and seated actor silhouettes', () => {
    const fit = chairDrawFit({ width: 32, height: 48 });
    expect(fit.w).toBe(CHAIR_DRAW_WIDTH_PX);
    expect(fit.h).toBe(CHAIR_DRAW_HEIGHT_PX);
    expect(fit.y).toBeGreaterThanOrEqual(-14);
    expect(fit.y + fit.h).toBe(TILE_PX);
  });
});
