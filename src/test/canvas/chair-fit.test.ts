import { describe, expect, it } from 'vitest';
import { TILE_PX } from '../../canvas/coordinates.ts';
import {
  CHAIR_DRAW_HEIGHT_PX,
  CHAIR_DRAW_WIDTH_PX,
  chairDrawFit,
} from '../../canvas/furniture-fit.ts';
import { SEATED_GUEST_DISPLAY_HEIGHT } from '../../canvas/world/actor-metrics.ts';

describe('chair draw fit', () => {
  it('scales chairs into the seated-guest size band', () => {
    const fit = chairDrawFit({ width: 32, height: 48 });
    expect(fit.w).toBe(CHAIR_DRAW_WIDTH_PX);
    expect(fit.h).toBeLessThanOrEqual(CHAIR_DRAW_HEIGHT_PX);
    expect(Math.abs(fit.h - SEATED_GUEST_DISPLAY_HEIGHT)).toBeLessThanOrEqual(12);
    expect(fit.y + fit.h).toBe(TILE_PX);
  });
});
