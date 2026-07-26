import { describe, expect, it } from 'vitest';
import { TILE_PX } from '../../canvas/coordinates.ts';
import { seatSitWorldPosition } from '../../canvas/world/seat-sit.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import type { Placement } from '../../domain/state/game-state.ts';

describe('¾ seat sit anchors', () => {
  it('places two south seats on the same column under a 2-top, facing the table', () => {
    const placements: Placement[] = [
      { id: 'table_a', itemKey: 'table_2seat', x: 2, y: 2, rotation: 0 },
    ];
    const seats = seatsFromPlacements(placements);
    expect(seats).toHaveLength(2);
    expect(seats[0]).toMatchObject({
      tablePlacementId: 'table_a',
      slotIndex: 0,
      x: 2,
      y: 3,
      facing: 180,
    });
    expect(seats[1]).toMatchObject({
      tablePlacementId: 'table_a',
      slotIndex: 1,
      x: 2,
      y: 3,
      facing: 180,
    });
  });

  it('flanks left/right and tucks north under the table top', () => {
    const seatL = {
      tablePlacementId: 't',
      slotIndex: 0,
      x: 2,
      y: 3,
      facing: 180 as const,
    };
    const seatR = { ...seatL, slotIndex: 1 };
    const left = seatSitWorldPosition(seatL);
    const right = seatSitWorldPosition(seatR);

    // Same south row, flanking the table center (x = 2.5 tiles).
    const tableCenterX = 2 * TILE_PX + TILE_PX / 2;
    expect(left.x).toBeLessThan(tableCenterX);
    expect(right.x).toBeGreaterThan(tableCenterX);

    // Nav-center tucked north; visual feet (y + TILE_PX/2 - 2) land near the table lip.
    const southTileCenterY = 3 * TILE_PX + TILE_PX / 2;
    const tableSouthEdgeY = 3 * TILE_PX;
    const leftFeetY = left.y + TILE_PX / 2 - 2;
    expect(left.y).toBeLessThan(southTileCenterY);
    expect(right.y).toBeLessThan(southTileCenterY);
    expect(leftFeetY).toBeLessThan(tableSouthEdgeY + TILE_PX * 0.35);
    expect(leftFeetY).toBeGreaterThan(tableSouthEdgeY - 6);
    expect(Math.abs(left.y - right.y)).toBeLessThan(1);
  });
});
