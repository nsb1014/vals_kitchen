import { describe, expect, it } from 'vitest';
import { TILE_PX } from '../../canvas/coordinates.ts';
import {
  CHAIR_DRAW_HEIGHT_PX,
  CHAIR_DRAW_WIDTH_PX,
  chairDrawFit,
} from '../../canvas/furniture-fit.ts';
import { SEATED_GUEST_DISPLAY_HEIGHT } from '../../canvas/world/actor-metrics.ts';

describe('backless stool draw fit', () => {
  it('keeps stools below the authored seated hip line', () => {
    const fit = chairDrawFit({ width: 32, height: 48 });
    expect(fit.w).toBeLessThanOrEqual(CHAIR_DRAW_WIDTH_PX);
    expect(fit.h).toBeLessThanOrEqual(CHAIR_DRAW_HEIGHT_PX);
    expect(fit.h).toBeLessThan(SEATED_GUEST_DISPLAY_HEIGHT / 2);
    expect(fit.h).toBeGreaterThanOrEqual(SEATED_GUEST_DISPLAY_HEIGHT / 4);
    expect(fit.y + fit.h).toBe(TILE_PX);
  });
});
