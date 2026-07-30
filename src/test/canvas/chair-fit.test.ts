import { describe, expect, it } from 'vitest';
import { TILE_PX } from '../../canvas/coordinates.ts';
import {
  CHAIR_DRAW_HEIGHT_PX,
  CHAIR_DRAW_WIDTH_PX,
  chairDrawFit,
} from '../../canvas/furniture-fit.ts';
import { SEATED_GUEST_DISPLAY_HEIGHT } from '../../canvas/world/ActorLayer.ts';

describe('chair draw fit', () => {
  it('scales chairs to the player-matched seat silhouette', () => {
    const fit = chairDrawFit({ width: 32, height: 48 });
    expect(fit.w).toBe(CHAIR_DRAW_WIDTH_PX);
    expect(fit.h).toBeLessThanOrEqual(CHAIR_DRAW_HEIGHT_PX);
    expect(fit.h).toBeGreaterThanOrEqual(SEATED_GUEST_DISPLAY_HEIGHT);
    expect(fit.y + fit.h).toBe(TILE_PX);
  });
});
