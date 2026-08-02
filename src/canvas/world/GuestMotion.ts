import type { FloorDay, FloorGuest } from '../../domain/floor/types.ts';
import { findPath, type GridPoint, type WalkGrid } from '../../domain/floor/pathfinding.ts';
import {
  waitingAreaGridAnchor,
  waitingGuestWorldPosition,
} from './waiting-line.ts';
import { NavController } from './NavController.ts';
import { seatFacingToActorFacing, seatSitWorldPosition } from './seat-sit.ts';
import { TILE_PX } from '../coordinates.ts';

export interface GuestPose {
  worldX: number;
  worldY: number;
  facing: 0 | 1 | 2 | 3;
  isMoving: boolean;
  walkFrame: number;
  /** True when guest has arrived at a seat (seated / ordered / eating). */
  isSeated?: boolean;
}

export interface GuestMotionSyncOpts {
  door: GridPoint;
  grid: WalkGrid;
  dtMs: number;
}

export interface GuestMotionSyncResult {
  /** Last fully reached cells that changed during this sync. */
  motionPositionUpdates: Array<{
    guestId: string;
    position: GridPoint;
  }>;
  /** Guest ids whose enter walk just finished this sync. */
  enteredGuestIds: string[];
  /** Guest ids whose walk to their assigned seat just finished this sync. */
  seatedGuestIds: string[];
  /** Guest ids whose exit walk reached the restaurant door this sync. */
  exitedGuestIds: string[];
}

/**
 * Canvas-side guest locomotion. Domain may snap `guest.seat`; this lerps
 * door → wait area (entering) and wait → seat / leave → door via NavController.
 */
export class GuestMotion {
  private readonly navs = new Map<string, NavController>();
  private readonly enterStarted = new Set<string>();
  private readonly seatedIds = new Set<string>();
  private readonly lastStages = new Map<string, FloorGuest['stage']>();
  private readonly enteredReported = new Set<string>();
  private readonly seatingReported = new Set<string>();
  private readonly exitReported = new Set<string>();

  sync(floor: FloorDay, opts: GuestMotionSyncOpts): GuestMotionSyncResult {
    const seen = new Set<string>();
    const motionPositionUpdates: GuestMotionSyncResult['motionPositionUpdates'] = [];
    const enteredGuestIds: string[] = [];
    const seatedGuestIds: string[] = [];
    const exitedGuestIds: string[] = [];

    for (const guest of floor.pool) {
      if (guest.stage === 'done' || guest.stage === 'queued') continue;
      seen.add(guest.id);
      this.rearmCompletionForStage(guest);
      const finished = this.syncGuest(guest, opts);
      const nav = this.navs.get(guest.id);
      if (
        nav &&
        isMotionStage(guest.stage) &&
        (guest.motionPosition?.x !== nav.position.x ||
          guest.motionPosition.y !== nav.position.y)
      ) {
        motionPositionUpdates.push({
          guestId: guest.id,
          position: { ...nav.position },
        });
      }
      if (finished === 'entered' && !this.enteredReported.has(guest.id)) {
        this.enteredReported.add(guest.id);
        enteredGuestIds.push(guest.id);
      }
      if (finished === 'seated' && !this.seatingReported.has(guest.id)) {
        this.seatingReported.add(guest.id);
        seatedGuestIds.push(guest.id);
      }
      if (finished === 'exited' && !this.exitReported.has(guest.id)) {
        this.exitReported.add(guest.id);
        exitedGuestIds.push(guest.id);
      }
    }

    for (const id of this.navs.keys()) {
      if (!seen.has(id)) {
        this.navs.delete(id);
        this.enterStarted.delete(id);
        this.seatedIds.delete(id);
        this.lastStages.delete(id);
        this.enteredReported.delete(id);
        this.seatingReported.delete(id);
        this.exitReported.delete(id);
      }
    }

    return {
      motionPositionUpdates,
      enteredGuestIds,
      seatedGuestIds,
      exitedGuestIds,
    };
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
      isSeated: this.seatedIds.has(guestId),
    };
  }

  /** True while any guest is walking through the doorway (enter or leave). */
  isDoorBusy(floor: FloorDay, door: GridPoint): boolean {
    for (const guest of floor.pool) {
      if (guest.stage === 'entering') return true;
      if (guest.stage !== 'leaving') continue;
      const nav = this.navs.get(guest.id);
      if (!nav) continue;
      if (nav.isMoving && nav.position.x === door.x && nav.position.y === door.y) return true;
      if (!nav.isMoving && nav.position.x === door.x && nav.position.y === door.y) return true;
    }
    return floor.pool.some((g) => g.stage === 'entering');
  }

  private syncGuest(
    guest: FloorGuest,
    opts: GuestMotionSyncOpts,
  ): 'entered' | 'seated' | 'exited' | null {
    let nav = this.navs.get(guest.id);
    if (!nav) {
      const start =
        guest.motionPosition && isMotionStage(guest.stage)
          ? { ...guest.motionPosition }
          : guest.stage === 'entering'
          ? { ...opts.door }
          : this.defaultCell(guest, opts.door);
      nav = new NavController(start, 2.4);
      this.navs.set(guest.id, nav);
      if (guest.stage === 'leaving' && guest.seat && !guest.motionPosition) {
        const sit = seatSitWorldPosition(guest.seat);
        nav.worldX = sit.x;
        nav.worldY = sit.y;
        nav.facing = seatFacingToActorFacing(guest.seat.facing);
      }
    }

    if (guest.stage === 'entering') {
      const waitCell = waitingAreaGridAnchor(opts.door);
      if (!this.enterStarted.has(guest.id)) {
        this.enterStarted.add(guest.id);
        const path =
          findPath(opts.grid, nav.position, waitCell, { allowBlockedEndpoints: true }) ??
          directPath(nav.position, waitCell);
        nav.setPath(path);
      }
      if (opts.dtMs > 0) nav.update(opts.dtMs);
      if (!nav.isMoving && nav.position.x === waitCell.x && nav.position.y === waitCell.y) {
        const world = waitingGuestWorldPosition(opts.door, 0);
        nav.worldX = world.x;
        nav.worldY = world.y;
        nav.facing = 1;
        return 'entered';
      }
      return null;
    }

    if (guest.stage === 'waiting') {
      const cell = waitingAreaGridAnchor(opts.door);
      const world = waitingGuestWorldPosition(opts.door, 0);
      if (nav.isMoving) {
        if (opts.dtMs > 0) nav.update(opts.dtMs);
        return null;
      }
      if (nav.position.x !== cell.x || nav.position.y !== cell.y) {
        nav.snapTo(cell);
      }
      nav.worldX = world.x;
      nav.worldY = world.y;
      nav.facing = 1;
      return null;
    }

    if (guest.stage === 'seating') {
      if (!guest.seat) return null;
      const seatCell = { x: guest.seat.x, y: guest.seat.y };
      const sit = seatSitWorldPosition(guest.seat);
      const atSeat =
        !nav.isMoving &&
        nav.position.x === seatCell.x &&
        nav.position.y === seatCell.y;

      if (!atSeat && !nav.isMoving) {
        const path =
          findPath(opts.grid, nav.position, seatCell, { allowBlockedEndpoints: true }) ??
          directPath(nav.position, seatCell);
        nav.setPath(path);
      }

      if (opts.dtMs > 0) nav.update(opts.dtMs);

      if (
        !nav.isMoving &&
        nav.position.x === seatCell.x &&
        nav.position.y === seatCell.y
      ) {
        nav.worldX = sit.x;
        nav.worldY = sit.y;
        nav.facing = seatFacingToActorFacing(guest.seat.facing);
        this.seatedIds.add(guest.id);
        return 'seated';
      }

      this.seatedIds.delete(guest.id);
      return null;
    }

    if (
      guest.stage === 'seated' ||
      guest.stage === 'ordered' ||
      guest.stage === 'eating'
    ) {
      if (!guest.seat) return null;
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
        this.seatedIds.add(guest.id);
        return null;
      }

      this.seatedIds.delete(guest.id);

      if (!nav.isMoving) {
        const path =
          findPath(opts.grid, nav.position, seatCell, { allowBlockedEndpoints: true }) ??
          directPath(nav.position, seatCell);
        nav.setPath(path);
      }

      if (opts.dtMs > 0) nav.update(opts.dtMs);

      if (!nav.isMoving) {
        nav.worldX = sit.x;
        nav.worldY = sit.y;
        nav.facing = seatFacingToActorFacing(guest.seat.facing);
        this.seatedIds.add(guest.id);
      }
      return null;
    }

    this.seatedIds.delete(guest.id);

    if (guest.stage === 'leaving') {
      const door = { ...opts.door };
      if (!nav.isMoving && (nav.position.x !== door.x || nav.position.y !== door.y)) {
        const path =
          findPath(opts.grid, nav.position, door, { allowBlockedEndpoints: true }) ??
          directPath(nav.position, door);
        nav.setPath(path);
      }
      if (opts.dtMs > 0) nav.update(opts.dtMs);
      if (!nav.isMoving && nav.position.x === door.x && nav.position.y === door.y) {
        return 'exited';
      }
    }
    return null;
  }

  private defaultCell(guest: FloorGuest, door: GridPoint): GridPoint {
    if (guest.stage === 'seating') return waitingAreaGridAnchor(door);
    if (guest.seat) return { x: guest.seat.x, y: guest.seat.y };
    if (guest.stage === 'entering') return { ...door };
    return waitingAreaGridAnchor(door);
  }

  private rearmCompletionForStage(guest: FloorGuest): void {
    const previous = this.lastStages.get(guest.id);
    if (previous === guest.stage) return;
    this.lastStages.set(guest.id, guest.stage);
    if (guest.stage === 'entering') this.enteredReported.delete(guest.id);
    if (guest.stage === 'seating') this.seatingReported.delete(guest.id);
    if (guest.stage === 'leaving') this.exitReported.delete(guest.id);
  }
}

function isMotionStage(stage: FloorGuest['stage']): boolean {
  return stage === 'entering' || stage === 'seating' || stage === 'leaving';
}

function directPath(from: GridPoint, to: GridPoint): GridPoint[] {
  if (from.x === to.x && from.y === to.y) return [{ ...from }];
  return [
    { ...from },
    { ...to },
  ];
}

export { TILE_PX };
