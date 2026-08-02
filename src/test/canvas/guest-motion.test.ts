import { describe, expect, it } from 'vitest';
import { GuestMotion, type GuestMotionSyncResult } from '../../canvas/world/GuestMotion.ts';
import { resolveGuestPose } from '../../canvas/world/ActorLayer.ts';
import { TILE_PX } from '../../canvas/coordinates.ts';
import { seatSitWorldPosition } from '../../canvas/world/seat-sit.ts';
import { waitingGuestWorldPosition } from '../../canvas/world/waiting-line.ts';
import type { FloorDay, FloorGuest, SeatSlot } from '../../domain/floor/types.ts';
import type { GridPoint, WalkGrid } from '../../domain/floor/pathfinding.ts';
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
const grid: WalkGrid = { w: 10, h: 8, blocked: new Set<string>() };

function sealedGridWithOpen(...openCells: GridPoint[]): WalkGrid {
  const open = new Set(openCells.map((cell) => `${cell.x},${cell.y}`));
  const blocked = new Set<string>();
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      if (!open.has(`${x},${y}`)) blocked.add(`${x},${y}`);
    }
  }
  return { ...grid, blocked };
}

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
  walkGrid = grid,
): GuestMotionSyncResult {
  return motion.sync(floorWith(guests), { door, grid: walkGrid, dtMs });
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

  it('holds an entering guest at the door when no route exists and retries later', () => {
    const motion = new GuestMotion();
    const entering = guest({ id: 'g1', stage: 'entering' });
    const sealed = sealedGridWithOpen(door);
    const doorWorld = {
      worldX: door.x * TILE_PX + TILE_PX / 2,
      worldY: door.y * TILE_PX + TILE_PX / 2,
    };

    for (let i = 0; i < 12; i++) {
      const result = sync(motion, [entering], 100, sealed);
      expect(result.enteredGuestIds).toEqual([]);
      expect(motion.pose(entering.id)).toMatchObject({
        ...doorWorld,
        isMoving: false,
        walkFrame: 0,
      });
    }

    sync(motion, [entering], 0, grid);
    expect(motion.pose(entering.id)!.isMoving).toBe(true);
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

  it('holds a seating guest at its current cell when the seat is unreachable', () => {
    const motion = new GuestMotion();
    const anchor = { x: 2, y: 4 };
    const seating = guest({
      id: 'g1',
      stage: 'seating',
      seat: seat('table_1', 6, 2),
      motionPosition: anchor,
    });
    const sealed = sealedGridWithOpen(anchor);
    const expectedPose = {
      worldX: anchor.x * TILE_PX + TILE_PX / 2,
      worldY: anchor.y * TILE_PX + TILE_PX / 2,
    };

    for (let i = 0; i < 12; i++) {
      const result = sync(motion, [seating], 100, sealed);
      expect(result.seatedGuestIds).toEqual([]);
      expect(motion.pose(seating.id)).toMatchObject({
        ...expectedPose,
        isMoving: false,
        isSeated: false,
        walkFrame: 0,
      });
    }
  });

  it.each(['seated', 'ordered', 'eating'] as const)(
    'holds a %s guest at its current cell when seat recovery has no route',
    (stage) => {
      const motion = new GuestMotion();
      const waiting = guest({ id: 'g1', stage: 'waiting' });
      const assignedSeat = seat('table_1', 6, 2);
      const currentCell = { x: door.x - 1, y: door.y - 1 };
      const currentWorld = waitingGuestWorldPosition(door, 0);
      const sealed = sealedGridWithOpen(currentCell);

      sync(motion, [waiting], 0, sealed);
      const recovering = { ...waiting, stage, seat: assignedSeat };

      for (let i = 0; i < 12; i++) {
        const result = sync(motion, [recovering], 100, sealed);
        expect(result.seatedGuestIds).toEqual([]);
        expect(motion.pose(recovering.id)).toMatchObject({
          worldX: currentWorld.x,
          worldY: currentWorld.y,
          isMoving: false,
          isSeated: false,
          walkFrame: 0,
        });
      }
    },
  );

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

  it('keeps a fresh leaving guest seated through a zero-delta probe, then reports exit once', () => {
    const motion = new GuestMotion();
    const assignedSeat = seat('table_1', 0, 2);
    const leaving = guest({ id: 'g1', stage: 'leaving', seat: assignedSeat });
    const seatedAt = seatSitWorldPosition(assignedSeat);

    const first = sync(motion, [leaving], 0);
    const start = motion.pose('g1')!;
    expect(first.exitedGuestIds).toEqual([]);
    expect(first.motionPositionUpdates).toEqual([]);
    expect(start.worldX).toBe(seatedAt.x);
    expect(start.worldY).toBe(seatedAt.y);
    expect(start.isMoving).toBe(false);
    expect(start.isSeated).toBe(true);

    sync(motion, [leaving]);
    expect(motion.pose('g1')).toMatchObject({
      isMoving: true,
      isSeated: false,
    });

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

  it('holds a leaving guest at its current pose when the door is unreachable', () => {
    const motion = new GuestMotion();
    const assignedSeat = seat('table_1', 6, 2);
    const leaving = guest({ id: 'g1', stage: 'leaving', seat: assignedSeat });
    const seatedAt = seatSitWorldPosition(assignedSeat);
    const sealed = sealedGridWithOpen({ x: assignedSeat.x, y: assignedSeat.y });

    for (let i = 0; i < 12; i++) {
      const result = sync(motion, [leaving], 100, sealed);
      expect(result.exitedGuestIds).toEqual([]);
      expect(motion.pose(leaving.id)).toMatchObject({
        worldX: seatedAt.x,
        worldY: seatedAt.y,
        isMoving: false,
        isSeated: true,
        walkFrame: 0,
      });
    }
  });

  it('preserves an already-rendered seated pose across the eating-to-leaving transition', () => {
    const motion = new GuestMotion();
    const assignedSeat = seat('table_1', 1, 2);
    const eating = guest({ id: 'g1', stage: 'eating', seat: assignedSeat });

    sync(motion, [eating], 0);
    expect(motion.pose(eating.id)!.isSeated).toBe(true);

    const leaving = { ...eating, stage: 'leaving' as const };
    sync(motion, [leaving], 0);
    expect(motion.pose(leaving.id)).toMatchObject({
      isMoving: false,
      isSeated: true,
    });

    sync(motion, [leaving]);
    expect(motion.pose(leaving.id)).toMatchObject({
      isMoving: true,
      isSeated: false,
    });
  });

  it('keeps the waiting alcove clear of a simultaneous departure', () => {
    const motion = new GuestMotion();
    const waiting = guest({ id: 'waiting', stage: 'waiting' });
    const leaving = guest({
      id: 'leaving',
      stage: 'leaving',
      seat: seat('table_1', 1, 2),
    });
    let minimumDistance = Number.POSITIVE_INFINITY;
    let exited = false;

    for (let i = 0; i < 240; i++) {
      const result = sync(motion, [waiting, leaving]);
      const waitingPose = motion.pose(waiting.id)!;
      const leavingPose = motion.pose(leaving.id)!;
      minimumDistance = Math.min(
        minimumDistance,
        Math.hypot(
          waitingPose.worldX - leavingPose.worldX,
          waitingPose.worldY - leavingPose.worldY,
        ),
      );
      if (result.exitedGuestIds.includes(leaving.id)) {
        exited = true;
        break;
      }
    }

    expect(exited).toBe(true);
    expect(minimumDistance).toBeGreaterThanOrEqual(TILE_PX);
  });

  it('lets a persisted departure clear the doorway before a loaded entrant moves', () => {
    const motion = new GuestMotion();
    const entering = guest({ id: 'entering', stage: 'entering' });
    const leaving = guest({
      id: 'leaving',
      stage: 'leaving',
      seat: seat('table_1', 1, 2),
      motionPosition: { x: door.x, y: door.y - 1 },
    });

    const first = sync(motion, [entering, leaving]);
    expect(first.exitedGuestIds).toEqual([]);
    // The deferred arrival remains offstage instead of occupying the exact
    // door endpoint that the departing sprite is about to traverse.
    expect(motion.pose(entering.id)).toBeNull();
    expect(motion.pose(leaving.id)!.isMoving).toBe(true);
    expect(motion.isDoorBusy(floorWith([entering, leaving]), door)).toBe(true);

    let exited = false;
    for (let i = 0; i < 80; i++) {
      if (sync(motion, [entering, leaving]).exitedGuestIds.includes(leaving.id)) {
        exited = true;
        break;
      }
      expect(motion.pose(entering.id)).toBeNull();
    }
    expect(exited).toBe(true);

    sync(motion, [entering]);
    expect(motion.pose(entering.id)!.isMoving).toBe(true);
  });

  it('keeps an authoritative hidden motion pose from falling back onto the door', () => {
    const entering = guest({ id: 'entering', stage: 'entering' });
    const hiddenMotion = {
      pose: () => null,
    } as unknown as GuestMotion;

    expect(resolveGuestPose(entering, 0, hiddenMotion)).toBeNull();
    expect(resolveGuestPose(entering, 0, null)).toMatchObject({
      worldX: door.x * TILE_PX + TILE_PX / 2,
      worldY: door.y * TILE_PX + TILE_PX / 2,
    });
  });

  it('holds a newly seating guest in the alcove while a departure owns the lane', () => {
    const motion = new GuestMotion();
    const seating = guest({
      id: 'seating',
      stage: 'seating',
      seat: seat('table_2', 5, 2),
    });
    const leaving = guest({
      id: 'leaving',
      stage: 'leaving',
      seat: seat('table_1', 1, 2),
      motionPosition: { x: door.x, y: door.y - 1 },
    });
    const wait = waitingGuestWorldPosition(door, 0);

    sync(motion, [seating, leaving]);
    expect(motion.pose(seating.id)).toMatchObject({
      worldX: wait.x,
      worldY: wait.y,
      isMoving: false,
      walkFrame: 0,
    });

    let exited = false;
    for (let i = 0; i < 80; i++) {
      if (sync(motion, [seating, leaving]).exitedGuestIds.includes(leaving.id)) {
        exited = true;
        break;
      }
      expect(motion.pose(seating.id)!.isMoving).toBe(false);
    }
    expect(exited).toBe(true);

    sync(motion, [seating]);
    expect(motion.pose(seating.id)!.isMoving).toBe(true);
  });

  it('serializes simultaneous departures without animating the queued guest', () => {
    const motion = new GuestMotion();
    const firstLeaving = guest({
      id: 'leaving_1',
      stage: 'leaving',
      seat: seat('table_1', 1, 2),
    });
    const secondLeaving = guest({
      id: 'leaving_2',
      stage: 'leaving',
      seat: seat('table_2', 5, 2),
    });
    const secondStart = seatSitWorldPosition(secondLeaving.seat!);

    sync(motion, [firstLeaving, secondLeaving]);
    expect(motion.pose(firstLeaving.id)!.isMoving).toBe(true);
    expect(motion.pose(firstLeaving.id)!.isSeated).toBe(false);
    expect(
      motion.isDoorBusy(floorWith([firstLeaving, secondLeaving]), door),
    ).toBe(false);
    expect(motion.pose(secondLeaving.id)).toMatchObject({
      worldX: secondStart.x,
      worldY: secondStart.y,
      isMoving: false,
      isSeated: true,
      walkFrame: 0,
    });

    let firstExited = false;
    let doorOpenedNearExit = false;
    for (let i = 0; i < 240; i++) {
      const result = sync(motion, [firstLeaving, secondLeaving]);
      doorOpenedNearExit ||= motion.isDoorBusy(
        floorWith([firstLeaving, secondLeaving]),
        door,
      );
      const held = motion.pose(secondLeaving.id)!;
      expect(held.isMoving).toBe(false);
      expect(held.isSeated).toBe(true);
      expect(held.walkFrame).toBe(0);
      expect(held.worldX).toBe(secondStart.x);
      expect(held.worldY).toBe(secondStart.y);
      if (result.exitedGuestIds.includes(firstLeaving.id)) {
        firstExited = true;
        break;
      }
    }
    expect(firstExited).toBe(true);
    expect(doorOpenedNearExit).toBe(true);

    sync(motion, [secondLeaving]);
    expect(motion.pose(secondLeaving.id)).toMatchObject({
      isMoving: true,
      isSeated: false,
    });
  });

  it('does not let a new departure preempt an entrant already using the corridor', () => {
    const motion = new GuestMotion();
    const entering = guest({ id: 'entering', stage: 'entering' });
    const leaving = guest({
      id: 'leaving',
      stage: 'leaving',
      seat: seat('table_1', 1, 2),
    });
    const leavingStart = seatSitWorldPosition(leaving.seat!);

    sync(motion, [entering, leaving]);
    expect(motion.pose(entering.id)!.isMoving).toBe(true);
    expect(motion.pose(leaving.id)).toMatchObject({
      worldX: leavingStart.x,
      worldY: leavingStart.y,
      isMoving: false,
      isSeated: true,
      walkFrame: 0,
    });

    let entered = false;
    for (let i = 0; i < 80; i++) {
      if (sync(motion, [entering, leaving]).enteredGuestIds.includes(entering.id)) {
        entered = true;
        break;
      }
      expect(motion.pose(leaving.id)!.isMoving).toBe(false);
    }
    expect(entered).toBe(true);

    const waiting = { ...entering, stage: 'waiting' as const };
    sync(motion, [waiting, leaving]);
    expect(motion.pose(leaving.id)).toMatchObject({
      isMoving: true,
      isSeated: false,
    });
  });

  it('reports the nearest live guest cells for player route blocking', () => {
    const motion = new GuestMotion();
    const waiting = guest({ id: 'waiting', stage: 'waiting' });
    const leaving = guest({
      id: 'leaving',
      stage: 'leaving',
      seat: seat('table_1', 1, 2),
    });
    const floor = floorWith([waiting, leaving]);

    motion.sync(floor, { door, grid, dtMs: 50 });
    expect(motion.playerBlockedGridCells(floor)).toEqual(
      expect.arrayContaining([
        { x: door.x - 1, y: door.y - 1 },
        { x: leaving.seat!.x, y: leaving.seat!.y },
      ]),
    );
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
    expect(pose.isSeated).toBe(false);
  });

  it('treats a persisted seat cell as an already-started departure', () => {
    const motion = new GuestMotion();
    const assignedSeat = seat('table_1', 1, 2);
    const entering = guest({ id: 'entering', stage: 'entering' });
    const leaving = guest({
      id: 'leaving',
      stage: 'leaving',
      seat: assignedSeat,
      motionPosition: { x: assignedSeat.x, y: assignedSeat.y },
    });

    const result = sync(motion, [entering, leaving], 0);
    expect(result.exitedGuestIds).toEqual([]);
    expect(motion.pose(entering.id)).toBeNull();
    expect(motion.pose(leaving.id)).toMatchObject({
      worldX: assignedSeat.x * TILE_PX + TILE_PX / 2,
      worldY: assignedSeat.y * TILE_PX + TILE_PX / 2,
      isMoving: true,
      isSeated: false,
    });
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
