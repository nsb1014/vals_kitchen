import { describe, expect, it } from 'vitest';
import { TILE_PX } from '../../canvas/coordinates.ts';
import {
  SEAT_SIT_OFFSET_Y,
  seatChairWorldPosition,
  seatSitWorldPosition,
} from '../../canvas/world/seat-sit.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import type { Placement } from '../../domain/state/game-state.ts';

describe('seat sit anchors', () => {
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

  it('plants chairs on the seat-cell floor and offsets diners onto the cushion', () => {
    const seatW = {
      tablePlacementId: 't',
      slotIndex: 0,
      x: 1,
      y: 2,
      facing: 90 as const,
    };
    const seatE = { ...seatW, slotIndex: 1, x: 3, facing: 270 as const };
    const chairW = seatChairWorldPosition(seatW);
    const chairE = seatChairWorldPosition(seatE);
    const west = seatSitWorldPosition(seatW);
    const east = seatSitWorldPosition(seatE);

    expect(chairW).toEqual({
      x: 1 * TILE_PX + TILE_PX / 2,
      y: 2 * TILE_PX + TILE_PX / 2,
    });
    expect(chairE).toEqual({
      x: 3 * TILE_PX + TILE_PX / 2,
      y: 2 * TILE_PX + TILE_PX / 2,
    });
    expect(SEAT_SIT_OFFSET_Y).toBeLessThan(0);
    expect(west).toEqual({ x: chairW.x, y: chairW.y + SEAT_SIT_OFFSET_Y });
    expect(east).toEqual({ x: chairE.x, y: chairE.y + SEAT_SIT_OFFSET_Y });
  });
});
