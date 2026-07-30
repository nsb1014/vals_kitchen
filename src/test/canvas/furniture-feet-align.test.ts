import { describe, expect, it } from 'vitest';
import {
  CHAIR_DRAW_HEIGHT_PX,
  STATION_DRAW_WIDTH_PX,
  TABLE_DRAW_WIDTH_PX,
  TABLE_MAX_HEIGHT_PX,
  chairDepthY,
  furnitureDepthY,
  furnitureDrawSize,
  seatedActorDepthY,
} from '../../canvas/furniture-fit.ts';
import { TILE_PX } from '../../canvas/coordinates.ts';
import {
  GUEST_DISPLAY_HEIGHT,
  SEATED_GUEST_DISPLAY_HEIGHT,
} from '../../canvas/world/ActorLayer.ts';

describe('furniture feet align', () => {
  it('places station art with feet on tile bottom', () => {
    const { w, h } = furnitureDrawSize({ width: 64, height: 96 }, 'prep_station');
    expect(w).toBe(STATION_DRAW_WIDTH_PX);
    expect(h).toBe(51);
  });

  it('keeps flat tabletops short so they do not swallow neighboring cells', () => {
    const { w, h } = furnitureDrawSize({ width: 64, height: 96 }, 'table_2seat');
    expect(w).toBeLessThanOrEqual(TABLE_DRAW_WIDTH_PX);
    expect(h).toBeLessThanOrEqual(TABLE_MAX_HEIGHT_PX);
  });

  it('sorts flat tables under actors while stations keep south-edge depth', () => {
    expect(furnitureDepthY(2, 'table_2seat')).toBe(2);
    expect(furnitureDepthY(2, 'prep_station')).toBe(3 * TILE_PX);
    const seatedFeetY = 2 * TILE_PX + TILE_PX / 2 + TILE_PX / 2 - 2;
    expect(furnitureDepthY(2, 'table_2seat')).toBeLessThan(seatedActorDepthY(seatedFeetY));
    expect(chairDepthY(seatedFeetY)).toBeLessThan(seatedActorDepthY(seatedFeetY));
  });

  it('keeps seated guests within the chair silhouette height', () => {
    expect(SEATED_GUEST_DISPLAY_HEIGHT).toBe(CHAIR_DRAW_HEIGHT_PX);
    expect(SEATED_GUEST_DISPLAY_HEIGHT).toBeLessThanOrEqual(GUEST_DISPLAY_HEIGHT);
  });
});
