import { describe, expect, it } from 'vitest';
import { TILE_PX } from '../../canvas/coordinates.ts';
import {
  SEAT_NS_HIP_OFFSET_PX,
  SEAT_SIDE_HIP_OFFSET_PX,
  SEAT_SIT_OFFSET_Y,
  seatChairWorldPosition,
  seatSitStaysOnChair,
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

  it('tucks stools and seated hips toward the table together', () => {
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

    const cellW = { x: 1 * TILE_PX + TILE_PX / 2, y: 2 * TILE_PX + TILE_PX / 2 };
    const cellE = { x: 3 * TILE_PX + TILE_PX / 2, y: 2 * TILE_PX + TILE_PX / 2 };
    expect(SEAT_SIT_OFFSET_Y).toBeLessThan(0);
    expect(SEAT_SIDE_HIP_OFFSET_PX).toBeLessThanOrEqual(8);
    // Stool and guest share the tableward-shifted anchor (centered sit).
    expect(chairW).toEqual({ x: cellW.x + SEAT_SIDE_HIP_OFFSET_PX, y: cellW.y });
    expect(chairE).toEqual({ x: cellE.x - SEAT_SIDE_HIP_OFFSET_PX, y: cellE.y });
    expect(west).toEqual({ x: chairW.x, y: chairW.y + SEAT_SIT_OFFSET_Y });
    expect(east).toEqual({ x: chairE.x, y: chairE.y + SEAT_SIT_OFFSET_Y });
    expect(chairW.x).toBeGreaterThan(cellW.x);
    expect(chairE.x).toBeLessThan(cellE.x);
    expect(seatSitStaysOnChair(seatW)).toBe(true);
    expect(seatSitStaysOnChair(seatE)).toBe(true);
  });

  it('shifts north+south stools and seated hips toward the table together', () => {
    const northSeat = {
      tablePlacementId: 't',
      slotIndex: 0,
      x: 2,
      y: 1,
      facing: 0 as const,
    };
    const southSeat = { ...northSeat, slotIndex: 1, y: 3, facing: 180 as const };
    const northStool = seatChairWorldPosition(northSeat);
    const southStool = seatChairWorldPosition(southSeat);
    const cellN = { x: 2 * TILE_PX + TILE_PX / 2, y: 1 * TILE_PX + TILE_PX / 2 };
    const cellS = { x: 2 * TILE_PX + TILE_PX / 2, y: 3 * TILE_PX + TILE_PX / 2 };

    expect(SEAT_NS_HIP_OFFSET_PX).toBeLessThanOrEqual(6);
    expect(northStool).toEqual({
      x: cellN.x,
      y: cellN.y + SEAT_NS_HIP_OFFSET_PX,
    });
    expect(southStool).toEqual({
      x: cellS.x,
      y: cellS.y - SEAT_NS_HIP_OFFSET_PX,
    });
    expect(seatSitWorldPosition(northSeat)).toEqual({
      x: northStool.x,
      y: northStool.y + SEAT_SIT_OFFSET_Y,
    });
    expect(seatSitWorldPosition(southSeat)).toEqual({
      x: southStool.x,
      y: southStool.y + SEAT_SIT_OFFSET_Y,
    });
    expect(seatSitStaysOnChair(northSeat)).toBe(true);
    expect(seatSitStaysOnChair(southSeat)).toBe(true);
  });

  it('keeps all four seat facings on their stools', () => {
    const facings = [0, 90, 180, 270] as const;
    for (const facing of facings) {
      const seat = {
        tablePlacementId: 't',
        slotIndex: 0,
        x: 2,
        y: 2,
        facing,
      };
      expect(seatSitStaysOnChair(seat), `facing ${facing}`).toBe(true);
    }
  });
});
