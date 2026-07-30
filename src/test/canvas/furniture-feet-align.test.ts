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
import { SEAT_CAMERA_BIAS_PX } from '../../canvas/world/seat-sit.ts';
import { TILE_PX } from '../../canvas/coordinates.ts';

describe('furniture feet align', () => {
  it('places station art with feet on tile bottom', () => {
    const { w, h } = furnitureDrawSize({ width: 64, height: 96 }, 'prep_station');
    expect(w).toBe(STATION_DRAW_WIDTH_PX);
    expect(h).toBe(51);
    const o = furnitureDrawOffset(w, h);
    expect(o.x).toBe((32 - STATION_DRAW_WIDTH_PX) / 2);
    expect(o.y).toBe(32 - 51);
  });

  it('gives tables more visual weight than chairs', () => {
    const { w, h } = furnitureDrawSize({ width: 64, height: 96 }, 'table_2seat');
    expect(w).toBe(TABLE_DRAW_WIDTH_PX);
    expect(h).toBe(54);
  });

  it('keeps seated guests in front of the same-row table via camera-biased feet', () => {
    const tableRow = 2;
    const tableY = furnitureDepthY(tableRow);
    const seatCellCenterY = tableRow * TILE_PX + TILE_PX / 2;
    const seatedFeetY = seatCellCenterY + SEAT_CAMERA_BIAS_PX + TILE_PX / 2 - 2;
    expect(chairDepthY(seatedFeetY)).toBeLessThan(seatedActorDepthY(seatedFeetY));
    expect(seatedActorDepthY(seatedFeetY)).toBeGreaterThan(tableY);
  });
});
