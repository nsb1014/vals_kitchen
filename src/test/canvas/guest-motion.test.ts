import { describe, expect, it } from 'vitest';
import { GuestMotion, type GuestMotionSyncResult } from '../../canvas/world/GuestMotion.ts';
import { TILE_PX } from '../../canvas/coordinates.ts';
import { seatSitWorldPosition } from '../../canvas/world/seat-sit.ts';
import { waitingGuestWorldPosition } from '../../canvas/world/waiting-line.ts';
import type { FloorDay, FloorGuest, SeatSlot } from '../../domain/floor/types.ts';
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

const door = { x: 3, y: 7 };
const grid = { w: 10, h: 8, blocked: new Set<string>() };

function seat(id: string, x: number, y: number): SeatSlot {
  return {
    tablePlacementId: id,
    slotIndex: 0,
    x,
    y,
    facing: 90,
  };
}

function sync(
  motion: GuestMotion,
  guests: FloorGuest[],
  dtMs = 50,
): GuestMotionSyncResult {
  return motion.sync(floorWith(guests), { door, grid, dtMs });
}

describe('GuestMotion', () => {
  it('reconstructs an entering guest from its persisted cell instead of the door', () => {
    const motion = new GuestMotion();
    const anchor = { x: 3, y: 5 };
    const entering = guest({
      id: 'g1',
      stage: 'entering',
      motionPosition: anchor,
    });

    const result = sync(motion, [entering], 0);
    const pose = motion.pose('g1')!;
    expect(result.enteredGuestIds).toEqual([]);
    expect(result.motionPositionUpdates).toEqual([]);
    expect(pose.worldX).toBe(anchor.x * TILE_PX + TILE_PX / 2);
    expect(pose.worldY).toBe(anchor.y * TILE_PX + TILE_PX / 2);
    expect(pose.isMoving).toBe(true);
  });

  it('reconstructs a seating guest from its persisted mid-walk cell', () => {
    const motion = new GuestMotion();
    const assignedSeat = seat('table_1', 0, 2);
    const anchor = { x: 2, y: 4 };
    const seating = guest({
      id: 'g1',
      stage: 'seating',
      seat: assignedSeat,
      motionPosition: anchor,
    });

    const result = sync(motion, [seating], 0);
    const pose = motion.pose('g1')!;
    expect(result.seatedGuestIds).toEqual([]);
    expect(result.motionPositionUpdates).toEqual([]);
    expect(pose.worldX).toBe(anchor.x * TILE_PX + TILE_PX / 2);
    expect(pose.worldY).toBe(anchor.y * TILE_PX + TILE_PX / 2);
    expect(pose.isMoving).toBe(true);
  });

  it('reports seating only after the guest walks from the waiting anchor to the seat', () => {
    const motion = new GuestMotion();
    const assignedSeat = seat('table_1', 0, 2);
    const seating = guest({ id: 'g1', stage: 'seating', seat: assignedSeat });

    const first = sync(motion, [seating], 16);
    const start = motion.pose('g1');
    const waiting = waitingGuestWorldPosition(door, 0);
    expect(first.seatedGuestIds).toEqual([]);
    expect(start).not.toBeNull();
    expect(start!.isMoving).toBe(true);
    expect(start!.isSeated).not.toBe(true);
    expect(Math.hypot(start!.worldX - waiting.x, start!.worldY - waiting.y)).toBeLessThan(
      TILE_PX,
    );

    const seatedAt = seatSitWorldPosition(assignedSeat);
    expect(Math.hypot(start!.worldX - seatedAt.x, start!.worldY - seatedAt.y)).toBeGreaterThan(
      TILE_PX,
    );

    let arrival: GuestMotionSyncResult | null = null;
    for (let i = 0; i < 200; i++) {
      const result = sync(motion, [seating]);
      if (result.seatedGuestIds.length > 0) {
        arrival = result;
        break;
      }
    }

    expect(arrival?.seatedGuestIds).toEqual(['g1']);
    const end = motion.pose('g1')!;
    expect(end.isMoving).toBe(false);
    expect(end.isSeated).toBe(true);
    expect(end.facing).toBe(0); // right toward table
    expect(end.worldX).toBe(seatedAt.x);
    expect(end.worldY).toBe(seatedAt.y);
    expect(sync(motion, [seating]).seatedGuestIds).toEqual([]);
  });

  it('reports every guest that reaches a seat in the same frame', () => {
    const motion = new GuestMotion();
    const guests = [
      guest({ id: 'g1', stage: 'seating', seat: seat('table_1', 0, 2) }),
      guest({ id: 'g2', stage: 'seating', seat: seat('table_2', 0, 2) }),
    ];

    let arrival: GuestMotionSyncResult | null = null;
    for (let i = 0; i < 200; i++) {
      const result = sync(motion, guests);
      if (result.seatedGuestIds.length > 0) {
        arrival = result;
        break;
      }
    }

    expect(arrival?.seatedGuestIds).toEqual(['g1', 'g2']);
    expect(sync(motion, guests).seatedGuestIds).toEqual([]);
  });

  it('reconstructs a leaving guest at the retained seat and reports exit only at the door', () => {
    const motion = new GuestMotion();
    const assignedSeat = seat('table_1', 0, 2);
    const leaving = guest({ id: 'g1', stage: 'leaving', seat: assignedSeat });
    const seatedAt = seatSitWorldPosition(assignedSeat);

    const first = sync(motion, [leaving], 0);
    const start = motion.pose('g1')!;
    expect(first.exitedGuestIds).toEqual([]);
    expect(start.worldX).toBe(seatedAt.x);
    expect(start.worldY).toBe(seatedAt.y);
    expect(start.isSeated).not.toBe(true);

    let arrival: GuestMotionSyncResult | null = null;
    for (let i = 0; i < 200; i++) {
      const result = sync(motion, [leaving]);
      if (result.exitedGuestIds.length > 0) {
        arrival = result;
        break;
      }
    }

    expect(arrival?.exitedGuestIds).toEqual(['g1']);
    const end = motion.pose('g1')!;
    expect(end.isMoving).toBe(false);
    expect(end.worldX).toBe(door.x * TILE_PX + TILE_PX / 2);
    expect(end.worldY).toBe(door.y * TILE_PX + TILE_PX / 2);
    expect(sync(motion, [leaving]).exitedGuestIds).toEqual([]);
  });

  it('reconstructs a leaving guest from its persisted mid-walk cell', () => {
    const motion = new GuestMotion();
    const assignedSeat = seat('table_1', 0, 2);
    const anchor = { x: 2, y: 5 };
    const leaving = guest({
      id: 'g1',
      stage: 'leaving',
      seat: assignedSeat,
      motionPosition: anchor,
    });

    const result = sync(motion, [leaving], 0);
    const pose = motion.pose('g1')!;
    expect(result.exitedGuestIds).toEqual([]);
    expect(result.motionPositionUpdates).toEqual([]);
    expect(pose.worldX).toBe(anchor.x * TILE_PX + TILE_PX / 2);
    expect(pose.worldY).toBe(anchor.y * TILE_PX + TILE_PX / 2);
    expect(pose.isMoving).toBe(true);
  });

  it('reports a newly reached discrete cell without reporting sub-tile progress', () => {
    const motion = new GuestMotion();
    const assignedSeat = seat('table_1', 0, 2);
    let seating = guest({ id: 'g1', stage: 'seating', seat: assignedSeat });

    const first = sync(motion, [seating], 16);
    expect(first.motionPositionUpdates).toHaveLength(1);
    const initialAnchor = first.motionPositionUpdates[0]!;
    seating = { ...seating, motionPosition: initialAnchor.position };

    expect(sync(motion, [seating], 50).motionPositionUpdates).toEqual([]);

    let nextAnchor: GuestMotionSyncResult['motionPositionUpdates'][number] | undefined;
    for (let i = 0; i < 20; i++) {
      const result = sync(motion, [seating], 50);
      nextAnchor = result.motionPositionUpdates[0];
      if (nextAnchor) break;
    }
    expect(nextAnchor?.guestId).toBe('g1');
    expect(nextAnchor?.position).not.toEqual(initialAnchor.position);
  });

  it('cleans up completion state so a reused guest id can report a later lifecycle', () => {
    const motion = new GuestMotion();
    const atDoor = seat('table_1', door.x, door.y);
    const leaving = guest({ id: 'g1', stage: 'leaving', seat: atDoor });

    expect(sync(motion, [leaving], 0).exitedGuestIds).toEqual(['g1']);
    expect(sync(motion, [leaving], 0).exitedGuestIds).toEqual([]);

    sync(motion, [guest({ id: 'g1', stage: 'done' })], 0);
    expect(sync(motion, [leaving], 0).exitedGuestIds).toEqual(['g1']);
  });
});
