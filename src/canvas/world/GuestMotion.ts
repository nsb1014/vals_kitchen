import type { FloorDay, FloorGuest } from '../../domain/floor/types.ts';
import { findPath, type GridPoint, type WalkGrid } from '../../domain/floor/pathfinding.ts';
import { waitingGuestGridAnchor } from './waiting-line.ts';
import { NavController } from './NavController.ts';
import { seatFacingToActorFacing, seatSitWorldPosition } from './seat-sit.ts';
import { TILE_PX } from '../coordinates.ts';

export interface GuestPose {
  worldX: number;
  worldY: number;
  facing: 0 | 1 | 2 | 3;
  isMoving: boolean;
  walkFrame: number;
}

export interface GuestMotionSyncOpts {
  door: GridPoint;
  grid: WalkGrid;
  dtMs: number;
}

/**
 * Canvas-side guest locomotion. Domain may snap `guest.seat`; this lerps
 * wait-line → seat (and leave → door) via NavController so seating is visible.
 */
export class GuestMotion {
  private readonly navs = new Map<string, NavController>();

  sync(floor: FloorDay, opts: GuestMotionSyncOpts): void {
    const seen = new Set<string>();
    let waitingIndex = 0;

    for (const guest of floor.pool) {
      if (guest.stage === 'done') continue;
      seen.add(guest.id);
      const waitIdx = guest.stage === 'waiting' ? waitingIndex++ : 0;
      this.syncGuest(guest, waitIdx, opts);
    }

    for (const id of this.navs.keys()) {
      if (!seen.has(id)) this.navs.delete(id);
    }
  }

  pose(guestId: string): GuestPose | null {
    const nav = this.navs.get(guestId);
    if (!nav) return null;
    return {
      worldX: nav.worldX,
      worldY: nav.worldY,
      facing: nav.facing,
      isMoving: nav.isMoving,
      walkFrame: nav.walkFrame(),
    };
  }

  private syncGuest(guest: FloorGuest, waitingIndex: number, opts: GuestMotionSyncOpts): void {
    let nav = this.navs.get(guest.id);
    if (!nav) {
      const start = this.defaultCell(guest, waitingIndex, opts.door);
      nav = new NavController(start, 2.4);
      this.navs.set(guest.id, nav);
    }

    if (guest.stage === 'waiting') {
      const cell = waitingGuestGridAnchor(opts.door);
      // Stack offset applied in ActorLayer; keep nav on door-north cell.
      if (nav.isMoving) {
        nav.snapTo(cell);
      } else if (nav.position.x !== cell.x || nav.position.y !== cell.y) {
        nav.snapTo(cell);
      }
      nav.facing = 1;
      return;
    }

    if (
      guest.stage === 'seated' ||
      guest.stage === 'ordered' ||
      guest.stage === 'eating'
    ) {
      if (!guest.seat) return;
      const seatCell = { x: guest.seat.x, y: guest.seat.y };
      const sit = seatSitWorldPosition(guest.seat);
      const atSeat =
        !nav.isMoving &&
        nav.position.x === seatCell.x &&
        nav.position.y === seatCell.y;

      if (atSeat) {
        nav.worldX = sit.x;
        nav.worldY = sit.y;
        nav.facing = seatFacingToActorFacing(guest.seat.facing);
        return;
      }

      if (!nav.isMoving) {
        const path =
          findPath(opts.grid, nav.position, seatCell) ??
          directPath(nav.position, seatCell);
        nav.setPath(path);
      }

      if (opts.dtMs > 0) nav.update(opts.dtMs);

      if (!nav.isMoving) {
        nav.worldX = sit.x;
        nav.worldY = sit.y;
        nav.facing = seatFacingToActorFacing(guest.seat.facing);
      }
      return;
    }

    if (guest.stage === 'leaving') {
      const door = { ...opts.door };
      if (!nav.isMoving && (nav.position.x !== door.x || nav.position.y !== door.y)) {
        const path = findPath(opts.grid, nav.position, door) ?? directPath(nav.position, door);
        nav.setPath(path);
      }
      if (opts.dtMs > 0) nav.update(opts.dtMs);
    }
  }

  private defaultCell(guest: FloorGuest, waitingIndex: number, door: GridPoint): GridPoint {
    if (guest.seat) return { x: guest.seat.x, y: guest.seat.y };
    void waitingIndex;
    return waitingGuestGridAnchor(door);
  }
}

function directPath(from: GridPoint, to: GridPoint): GridPoint[] {
  if (from.x === to.x && from.y === to.y) return [{ ...from }];
  return [
    { ...from },
    { ...to },
  ];
}

/** Waiting-line world X stack (matches ActorLayer). */
export function waitingStackWorldX(baseX: number, waitingIndex: number): number {
  return baseX + (waitingIndex - 1) * 10;
}

export { TILE_PX };
