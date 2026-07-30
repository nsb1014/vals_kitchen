import { describe, expect, it } from 'vitest';
import { TILE_PX } from '../../canvas/coordinates.ts';
import {
  SEAT_CAMERA_BIAS_PX,
  seatSitWorldPosition,
} from '../../canvas/world/seat-sit.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import type { Placement } from '../../domain/state/game-state.ts';

describe('¾ seat sit anchors', () => {
  it('places west+east seats beside a 2-top, facing the table', () => {
    const placements: Placement[] = [
      { id: 'table_a', itemKey: 'table_2seat', x: 2, y: 2, rotation: 0 },
    ];
    const seats = seatsFromPlacements(placements);
    expect(seats).toHaveLength(2);
    expect(seats[0]).toMatchObject({
      tablePlacementId: 'table_a',
      slotIndex: 0,
      x: 1,
      y: 2,
      facing: 90,
    });
    expect(seats[1]).toMatchObject({
      tablePlacementId: 'table_a',
      slotIndex: 1,
      x: 3,
      y: 2,
      facing: 270,
    });
  });

  it('keeps side diners beside the table and biased toward the camera', () => {
    const seatW = {
      tablePlacementId: 't',
      slotIndex: 0,
      x: 1,
      y: 2,
      facing: 90 as const,
    };
    const seatE = { ...seatW, slotIndex: 1, x: 3, facing: 270 as const };
    const west = seatSitWorldPosition(seatW);
    const east = seatSitWorldPosition(seatE);

    const tableCenterX = 2 * TILE_PX + TILE_PX / 2;
    const tableCenterY = 2 * TILE_PX + TILE_PX / 2;

    expect(west.x).toBeLessThan(tableCenterX);
    expect(east.x).toBeGreaterThan(tableCenterX);

    // Shallow tuck toward the table, not buried in the tabletop.
    const westCellCenterX = 1 * TILE_PX + TILE_PX / 2;
    const eastCellCenterX = 3 * TILE_PX + TILE_PX / 2;
    expect(west.x).toBeGreaterThan(westCellCenterX);
    expect(east.x).toBeLessThan(eastCellCenterX);
    expect(west.x - westCellCenterX).toBeLessThan(TILE_PX * 0.2);
    expect(eastCellCenterX - east.x).toBeLessThan(TILE_PX * 0.2);

    // Camera bias puts feet south of the table row so Y-sort clears the top-down table.
    expect(west.y).toBeCloseTo(tableCenterY + SEAT_CAMERA_BIAS_PX);
    expect(east.y).toBeCloseTo(tableCenterY + SEAT_CAMERA_BIAS_PX);
  });
});
