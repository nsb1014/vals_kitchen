import type { FloorDay, FloorGuest } from '../../domain/floor/types.ts';
import { findPath, type GridPoint, type WalkGrid } from '../../domain/floor/pathfinding.ts';
import {
  doorwayLaneGridAnchor,
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
  private readonly hiddenDoorEntrants = new Set<string>();
  /** Exclusive owner of the one-cell guest doorway corridor. */
  private doorTrafficGuestId: string | null = null;

  sync(floor: FloorDay, opts: GuestMotionSyncOpts): GuestMotionSyncResult {
    const seen = new Set<string>();
    const motionPositionUpdates: GuestMotionSyncResult['motionPositionUpdates'] = [];
    const enteredGuestIds: string[] = [];
    const seatedGuestIds: string[] = [];
    const exitedGuestIds: string[] = [];
    this.refreshDoorTrafficOwner(floor, opts.door);
    const doorTrafficOwner = floor.pool.find(
      (guest) => guest.id === this.doorTrafficGuestId,
    );

    for (const guest of floor.pool) {
      if (guest.stage === 'done' || guest.stage === 'queued') continue;
      seen.add(guest.id);
      this.rearmCompletionForStage(guest);
      const finished = this.syncGuest(
        guest,
        opts,
        this.doorTrafficGuestId === guest.id ||
          (guest.stage === 'seating' && doorTrafficOwner?.stage !== 'leaving'),
      );
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
        this.hiddenDoorEntrants.delete(id);
        if (this.doorTrafficGuestId === id) this.doorTrafficGuestId = null;
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
    if (this.hiddenDoorEntrants.has(guestId)) return null;
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

  /** Current cells occupied by visible guests, used to keep new player routes clear. */
  playerBlockedGridCells(floor: FloorDay): GridPoint[] {
    const cells = new Map<string, GridPoint>();
    for (const guest of floor.pool) {
      if (guest.stage === 'queued' || guest.stage === 'done') continue;
      if (this.hiddenDoorEntrants.has(guest.id)) continue;
      const nav = this.navs.get(guest.id);
      const cell = nav
        ? {
            x: Math.round((nav.worldX - TILE_PX / 2) / TILE_PX),
            y: Math.round((nav.worldY - TILE_PX / 2) / TILE_PX),
          }
        : guest.motionPosition ?? guest.seat;
      if (!cell) continue;
      cells.set(`${cell.x},${cell.y}`, { x: cell.x, y: cell.y });
    }
    return [...cells.values()];
  }

  /** True while any guest is walking through the doorway (enter or leave). */
  isDoorBusy(floor: FloorDay, door: GridPoint): boolean {
    for (const guest of floor.pool) {
      if (guest.stage === 'entering') return true;
      if (guest.stage !== 'leaving') continue;
      const nav = this.navs.get(guest.id);
      if (!nav) continue;
      const destination = nav.destination;
      if (destination?.x === door.x && destination.y === door.y) {
        const doorWorldX = door.x * TILE_PX + TILE_PX / 2;
        const doorWorldY = door.y * TILE_PX + TILE_PX / 2;
        if (Math.hypot(nav.worldX - doorWorldX, nav.worldY - doorWorldY) <= TILE_PX + 0.5) {
          return true;
        }
      }
      if (nav.isMoving && nav.position.x === door.x && nav.position.y === door.y) return true;
      if (!nav.isMoving && nav.position.x === door.x && nav.position.y === door.y) return true;
    }
    return floor.pool.some((g) => g.stage === 'entering');
  }

  private syncGuest(
    guest: FloorGuest,
    opts: GuestMotionSyncOpts,
    ownsDoorTraffic: boolean,
  ): 'entered' | 'seated' | 'exited' | null {
    if (guest.stage !== 'entering') this.hiddenDoorEntrants.delete(guest.id);
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
      // A loaded or legacy day can contain an entrant while a persisted
      // departure already owns the narrow door. Keep the entrant visibly
      // still outside until the corridor is released.
      if (!ownsDoorTraffic) {
        this.hiddenDoorEntrants.add(guest.id);
        return null;
      }
      this.hiddenDoorEntrants.delete(guest.id);
      const waitCell = waitingAreaGridAnchor(opts.door);
      if (!this.enterStarted.has(guest.id)) {
        const path = findPath(opts.grid, nav.position, waitCell, {
          allowBlockedEndpoints: true,
        });
        if (path) {
          this.enterStarted.add(guest.id);
          nav.setPath(path);
        }
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
      if (!ownsDoorTraffic) return null;
      const seatCell = { x: guest.seat.x, y: guest.seat.y };
      const sit = seatSitWorldPosition(guest.seat);
      const atSeat =
        !nav.isMoving &&
        nav.position.x === seatCell.x &&
        nav.position.y === seatCell.y;

      if (!atSeat && !nav.isMoving) {
        const path = findPath(opts.grid, nav.position, seatCell, {
          allowBlockedEndpoints: true,
        });
        if (path) nav.setPath(path);
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
        const path = findPath(opts.grid, nav.position, seatCell, {
          allowBlockedEndpoints: true,
        });
        if (path) nav.setPath(path);
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
      }
      return null;
    }

    this.seatedIds.delete(guest.id);

    if (guest.stage === 'leaving') {
      // Departures wait at their current pose until they exclusively own the
      // lane. In particular, do not assign a path: isMoving must remain false
      // so a queued departure cannot animate walking in place.
      if (!ownsDoorTraffic) return null;
      const door = { ...opts.door };
      if (!nav.isMoving && (nav.position.x !== door.x || nav.position.y !== door.y)) {
        const lane = doorwayLaneGridAnchor(door);
        const waiting = waitingAreaGridAnchor(door);
        const departureBlocked = new Set(opts.grid.blocked);
        departureBlocked.add(`${waiting.x},${waiting.y}`);
        const toLane = findPath(
          { ...opts.grid, blocked: departureBlocked },
          nav.position,
          lane,
          { allowBlockedEndpoints: true },
        );
        if (toLane) {
          const path = [...toLane];
          const tail = path[path.length - 1];
          if (!tail || tail.x !== door.x || tail.y !== door.y) path.push(door);
          nav.setPath(path);
        }
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

  /**
   * Preserve a traffic owner across frames, then recover an in-flight saved
   * departure before choosing a new entrant or deterministic departure.
   */
  private refreshDoorTrafficOwner(floor: FloorDay, door: GridPoint): void {
    const candidates = floor.pool.filter(
      (guest) =>
        guest.stage === 'entering' ||
        guest.stage === 'seating' ||
        guest.stage === 'leaving',
    );
    if (
      this.doorTrafficGuestId &&
      candidates.some((guest) => guest.id === this.doorTrafficGuestId)
    ) {
      return;
    }

    const lane = doorwayLaneGridAnchor(door);
    const persistedDepartureAtDoor = candidates.find(
      (guest) =>
        guest.stage === 'leaving' &&
        guest.motionPosition &&
        ((guest.motionPosition.x === lane.x && guest.motionPosition.y === lane.y) ||
          (guest.motionPosition.x === door.x && guest.motionPosition.y === door.y)),
    );
    const persistedDeparture = candidates.find(
      (guest) =>
        guest.stage === 'leaving' &&
        guest.motionPosition &&
        (!guest.seat ||
          guest.motionPosition.x !== guest.seat.x ||
          guest.motionPosition.y !== guest.seat.y),
    );
    const arrival = candidates.find(
      (guest) => guest.stage === 'entering' || guest.stage === 'seating',
    );
    const departure = candidates.find((guest) => guest.stage === 'leaving');

    this.doorTrafficGuestId =
      persistedDepartureAtDoor?.id ??
      persistedDeparture?.id ??
      arrival?.id ??
      departure?.id ??
      null;
  }
}

function isMotionStage(stage: FloorGuest['stage']): boolean {
  return stage === 'entering' || stage === 'seating' || stage === 'leaving';
}

export { TILE_PX };
