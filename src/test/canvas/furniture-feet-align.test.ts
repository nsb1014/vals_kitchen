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
  GUEST_SIT_CONTENT_HEIGHT_PX,
  GUEST_WALK_CONTENT_HEIGHT_PX,
  PLAYER_CONTENT_HEIGHT_PX,
  PLAYER_DISPLAY_HEIGHT,
  SEATED_GUEST_DISPLAY_HEIGHT,
} from '../../canvas/world/actor-metrics.ts';

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

  it('keeps actors ~2 tiles tall and chairs in the same band as seated guests', () => {
    expect(PLAYER_DISPLAY_HEIGHT).toBeGreaterThanOrEqual(TILE_PX * 1.75);
    expect(GUEST_DISPLAY_HEIGHT).toBe(PLAYER_DISPLAY_HEIGHT);
    expect(SEATED_GUEST_DISPLAY_HEIGHT).toBeGreaterThanOrEqual(PLAYER_DISPLAY_HEIGHT);
    expect(Math.abs(CHAIR_DRAW_HEIGHT_PX - SEATED_GUEST_DISPLAY_HEIGHT)).toBeLessThanOrEqual(10);
    expect(PLAYER_CONTENT_HEIGHT_PX).toBeLessThanOrEqual(96);
    expect(GUEST_WALK_CONTENT_HEIGHT_PX).toBeLessThanOrEqual(184);
    expect(GUEST_SIT_CONTENT_HEIGHT_PX).toBeLessThan(GUEST_WALK_CONTENT_HEIGHT_PX);
  });
});
