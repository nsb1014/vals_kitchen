import { describe, expect, it } from 'vitest';
import { GuestMotion } from '../../canvas/world/GuestMotion.ts';
import { TILE_PX } from '../../canvas/coordinates.ts';
import type { FloorDay, FloorGuest } from '../../domain/floor/types.ts';
import type { Customer } from '../../domain/day/types.ts';

function guest(partial: Partial<FloorGuest> & Pick<FloorGuest, 'id' | 'stage'>): FloorGuest {
  const customer: Customer = {
    id: partial.id,
    archetypeId: 'comfort_seeker',
    preference: { primary: { UM: 'mid' }, avoid: {}, phrases: ['savory'] },
  };
  return {
    customer,
    eatTicksRemaining: 0,
    ...partial,
  };
}

function floorWith(pool: FloorGuest[]): FloorDay {
  return {
    pool,
    tables: [],
    seats: [],
    tickets: [],
    carriedTicketId: null,
    selectedTicketId: null,
    tutorialStep: null,
    playerPosition: { x: 1, y: 1 },
  };
}

describe('GuestMotion', () => {
  it('lerps a newly seated guest from the wait line toward the seat instead of snapping', () => {
    const motion = new GuestMotion();
    const waiting = guest({ id: 'g1', stage: 'waiting' });
    const door = { x: 3, y: 7 };

    motion.sync(floorWith([waiting]), {
      door,
      grid: { w: 10, h: 8, blocked: new Set() },
      dtMs: 0,
    });
    const start = motion.pose('g1');
    expect(start).not.toBeNull();
    expect(start!.isMoving).toBe(false);

    const seated = guest({
      id: 'g1',
      stage: 'seated',
      seat: {
        tablePlacementId: 'table_1',
        slotIndex: 0,
        x: 0,
        y: 2,
        facing: 90,
      },
    });
    motion.sync(floorWith([seated]), {
      door,
      grid: { w: 10, h: 8, blocked: new Set() },
      dtMs: 16,
    });
    const mid = motion.pose('g1');
    expect(mid).not.toBeNull();
    expect(mid!.isMoving).toBe(true);

    // Must not already be at the sit anchor after one frame.
    const seatX = 0 * TILE_PX + TILE_PX / 2;
    expect(Math.hypot(mid!.worldX - seatX, mid!.worldY - 2 * TILE_PX)).toBeGreaterThan(8);

    // Advance far enough to arrive.
    for (let i = 0; i < 200; i++) {
      motion.sync(floorWith([seated]), {
        door,
        grid: { w: 10, h: 8, blocked: new Set() },
        dtMs: 50,
      });
      if (!motion.pose('g1')!.isMoving) break;
    }
    const end = motion.pose('g1')!;
    expect(end.isMoving).toBe(false);
    expect(end.facing).toBe(0); // right toward table
  });
});
