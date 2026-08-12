import { describe, expect, it } from 'vitest';
import { FurnitureLayer } from '../../canvas/layers/FurnitureLayer.ts';
import type { Placement } from '../../domain/state/game-state.ts';
import type { SeatSlot } from '../../domain/floor/types.ts';

const placement = (id: string, itemKey: string, x: number, y: number): Placement => ({
  id,
  itemKey,
  x,
  y,
  rotation: 0,
});

const seat = (
  tablePlacementId: string,
  slotIndex: number,
  x: number,
  y: number,
  facing: SeatSlot['facing'],
): SeatSlot => ({ tablePlacementId, slotIndex, x, y, facing });

describe('furniture seating depth debug', () => {
  it('reports table and stool roots in deterministic identity order', () => {
    const layer = new FurnitureLayer();
    layer.sync(
      [
        placement('table_b', 'table_4seat', 4, 2),
        placement('rug', 'decor_rug', 0, 2),
        placement('table_a', 'table_2seat', 2, 2),
      ],
      false,
      [
        seat('table_b', 1, 4, 3, 180),
        seat('table_a', 1, 2, 2, 90),
        seat('table_a', 0, 2, 1, 0),
      ],
    );

    expect(layer.getSeatingDepthDebug()).toEqual({
      tables: [
        { placementId: 'table_a', itemKey: 'table_2seat', zIndex: 96, x: 64, y: 64 },
        { placementId: 'table_b', itemKey: 'table_4seat', zIndex: 96, x: 128, y: 64 },
      ],
      // Stool roots tuck toward their table by the shared hip shift (side 6px,
      // NS 4px) so cushions stay under the seated guests.
      chairs: [
        { tablePlacementId: 'table_a', slotIndex: 0, zIndex: 65, x: 64, y: 34 },
        { tablePlacementId: 'table_a', slotIndex: 1, zIndex: 93, x: 70, y: 62 },
        { tablePlacementId: 'table_b', slotIndex: 1, zIndex: 121, x: 128, y: 90 },
      ],
    });
  });
});
