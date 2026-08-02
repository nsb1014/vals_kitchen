import { describe, expect, it } from 'vitest';
import {
  CHAIR_DRAW_HEIGHT_PX,
  DECOR_DRAW_WIDTH_PX,
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

  it('preserves the distinct physical scale of coordinated décor', () => {
    const plant = furnitureDrawSize({ width: 80, height: 104 }, 'decor_plant');
    const flowers = furnitureDrawSize({ width: 64, height: 80 }, 'decor_flowers');
    const rug = furnitureDrawSize({ width: 104, height: 72 }, 'decor_rug');
    const lamp = furnitureDrawSize({ width: 72, height: 108 }, 'decor_lamp');
    const sign = furnitureDrawSize({ width: 80, height: 104 }, 'decor_sign');

    expect(plant.w).toBe(DECOR_DRAW_WIDTH_PX.decor_plant);
    expect(flowers.w).toBe(DECOR_DRAW_WIDTH_PX.decor_flowers);
    expect(rug.w).toBe(DECOR_DRAW_WIDTH_PX.decor_rug);
    expect(lamp.w).toBe(DECOR_DRAW_WIDTH_PX.decor_lamp);
    expect(sign.w).toBe(DECOR_DRAW_WIDTH_PX.decor_sign);
    expect(flowers.h).toBeLessThan(plant.h);
    expect(rug.w).toBeGreaterThan(rug.h);
    expect(lamp.h).toBeGreaterThan(plant.h);
  });

  it('sorts flat tables under actors while stations keep south-edge depth', () => {
    expect(furnitureDepthY(2, 'table_2seat')).toBe(2);
    expect(furnitureDepthY(2, 'decor_rug')).toBe(2);
    expect(furnitureDepthY(2, 'prep_station')).toBe(3 * TILE_PX);
    const seatedFeetY = 2 * TILE_PX + TILE_PX / 2 + TILE_PX / 2 - 2;
    expect(furnitureDepthY(2, 'table_2seat')).toBeLessThan(seatedActorDepthY(seatedFeetY));
    expect(chairDepthY(seatedFeetY)).toBeLessThan(seatedActorDepthY(seatedFeetY));
  });

  it('uses one actor frame scale and keeps stools below seated hips', () => {
    expect(PLAYER_DISPLAY_HEIGHT).toBeGreaterThanOrEqual(TILE_PX * 1.75);
    expect(GUEST_DISPLAY_HEIGHT).toBe(PLAYER_DISPLAY_HEIGHT);
    expect(SEATED_GUEST_DISPLAY_HEIGHT).toBe(PLAYER_DISPLAY_HEIGHT);
    expect(CHAIR_DRAW_HEIGHT_PX).toBeLessThan(SEATED_GUEST_DISPLAY_HEIGHT / 2);
    expect(PLAYER_CONTENT_HEIGHT_PX).toBe(160);
    expect(GUEST_WALK_CONTENT_HEIGHT_PX).toBe(PLAYER_CONTENT_HEIGHT_PX);
    expect(GUEST_SIT_CONTENT_HEIGHT_PX).toBe(GUEST_WALK_CONTENT_HEIGHT_PX);
  });
});
