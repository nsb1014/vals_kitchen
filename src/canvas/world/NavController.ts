import type { GridPoint } from '../../domain/floor/pathfinding.ts';
import { TILE_PX } from '../coordinates.ts';

const WALK_FRAME_SEQUENCE = [0, 1, 0, 2] as const;

export type SegmentEaseRole = 'only' | 'first' | 'mid' | 'last';

/**
 * Segment visual easing. Mid-path segments stay linear so 90° turns keep
 * momentum (no smoothstep full-stop at every corner). Single-segment and
 * terminal segments still ease. Does not change tile timing.
 */
export function easeSegmentProgress(
  t: number,
  role: SegmentEaseRole = 'only',
): number {
  const x = Math.min(1, Math.max(0, t));
  switch (role) {
    case 'mid':
      return x;
    case 'first':
      // Ease-in from rest; ends at full speed into the next segment.
      return x * x;
    case 'last':
      // Ease-out into a stop; starts at full speed from the prior segment.
      return 1 - (1 - x) * (1 - x);
    case 'only':
    default:
      return x * x * (3 - 2 * x);
  }
}

function segmentEaseRole(index: number, pathLength: number): SegmentEaseRole {
  const lastIndex = pathLength - 2;
  if (lastIndex <= 0) return 'only';
  if (index <= 0) return 'first';
  if (index >= lastIndex) return 'last';
  return 'mid';
}

/** Pure path follower — interpolates world position between grid cells. */
export class NavController {
  private path: GridPoint[] = [];
  private index = 0;
  private readonly speedTilesPerMs: number;
  /** Progress 0..1 within the current segment (from path[index] → path[index+1]). */
  private progress = 0;
  /**
   * When repathing mid-tile, the first segment lerps from the preserved world
   * feet position to the next cell center instead of snapping back to the
   * from-cell center.
   */
  private segmentOriginX: number | null = null;
  private segmentOriginY: number | null = null;
  /**
   * Goal cell queued while walking. Callers repath from the arrival cell when
   * the active path ends (a mid-walk path snapshot would start from the wrong cell).
   */
  private bufferedGoal: GridPoint | null = null;
  /** Discrete cell used for pathfinding / adjacency. */
  position: GridPoint;
  /** Smooth world feet position (pixels). */
  worldX = 0;
  worldY = 0;
  /** Facing for animation: 0=right 1=down 2=up 3=left */
  facing: 0 | 1 | 2 | 3 = 1;
  /** Distance walked in tiles (for walk-cycle phasing). */
  distanceWalked = 0;

  constructor(start: GridPoint, speedTilesPerSecond = 2) {
    this.position = { ...start };
    this.speedTilesPerMs = speedTilesPerSecond / 1000;
    this.snapTo(start);
  }

  get isMoving(): boolean {
    return this.path.length > 0 && this.index < this.path.length - 1;
  }

  /** Final cell of the active path while walking. */
  get destination(): GridPoint | null {
    if (!this.isMoving) return null;
    const end = this.path[this.path.length - 1];
    return end ? { ...end } : null;
  }

  /** Queued mid-walk destination, if any. */
  get bufferedDestination(): GridPoint | null {
    return this.bufferedGoal ? { ...this.bufferedGoal } : null;
  }

  /** Remaining path cells from the current index through the destination. */
  get remainingPath(): GridPoint[] {
    if (!this.isMoving) return [];
    return this.path.slice(this.index).map((cell) => ({ ...cell }));
  }

  snapTo(cell: GridPoint): void {
    this.path = [];
    this.index = 0;
    this.progress = 0;
    this.segmentOriginX = null;
    this.segmentOriginY = null;
    this.bufferedGoal = null;
    this.position = { ...cell };
    const world = cellCenter(cell);
    this.worldX = world.x;
    this.worldY = world.y;
  }

  clearBufferedGoal(): void {
    this.bufferedGoal = null;
  }

  /**
   * Queue a destination while walking. Replaces any previously buffered goal.
   * No-op storage when idle — callers should `setPath` directly when not moving.
   */
  bufferGoal(goal: GridPoint): void {
    this.bufferedGoal = { ...goal };
  }

  /** Take the buffered goal (clears). Null when none armed. */
  consumeBufferedGoal(): GridPoint | null {
    const goal = this.bufferedGoal;
    this.bufferedGoal = null;
    return goal ? { ...goal } : null;
  }

  setPath(path: GridPoint[]): void {
    if (path.length === 0) {
      this.path = [];
      this.index = 0;
      this.progress = 0;
      this.segmentOriginX = null;
      this.segmentOriginY = null;
      return;
    }
    const start = path[0]!;
    const sameCell = start.x === this.position.x && start.y === this.position.y;
    const midTile =
      sameCell &&
      (Math.abs(this.worldX - (start.x * TILE_PX + TILE_PX / 2)) > 0.5 ||
        Math.abs(this.worldY - (start.y * TILE_PX + TILE_PX / 2)) > 0.5);
    this.path = path.map((p) => ({ ...p }));
    this.index = 0;
    this.progress = 0;
    this.position = { ...start };
    // Keep mid-tile world position when repathing from the same cell so the
    // sprite does not snap back to the cell center like a placed object.
    if (!sameCell) {
      const world = cellCenter(this.position);
      this.worldX = world.x;
      this.worldY = world.y;
      this.segmentOriginX = null;
      this.segmentOriginY = null;
    } else if (midTile) {
      this.segmentOriginX = this.worldX;
      this.segmentOriginY = this.worldY;
    } else {
      this.segmentOriginX = null;
      this.segmentOriginY = null;
    }
    this.updateFacingFromSegment();
  }

  update(dtMs: number): void {
    // Cap catch-up when the tab was backgrounded, but still consume the
    // full allowed delta in substeps so callers can pass larger ticks.
    let remaining = Math.min(dtMs, 100);
    while (remaining > 0 && this.isMoving) {
      const step = Math.min(remaining, 32);
      remaining -= step;
      this.progress += this.speedTilesPerMs * step;
      this.distanceWalked += this.speedTilesPerMs * step;

      while (this.progress >= 1 && this.isMoving) {
        this.progress -= 1;
        this.index += 1;
        // Later segments always run cell-center → cell-center.
        this.segmentOriginX = null;
        this.segmentOriginY = null;
        const cell = this.path[this.index];
        if (cell) this.position = { ...cell };
        this.updateFacingFromSegment();
      }
    }

    const from = this.path[this.index];
    const to = this.path[this.index + 1];
    if (!from) return;
    if (!to) {
      const world = cellCenter(from);
      this.worldX = world.x;
      this.worldY = world.y;
      this.segmentOriginX = null;
      this.segmentOriginY = null;
      return;
    }
    const a =
      this.segmentOriginX != null && this.segmentOriginY != null
        ? { x: this.segmentOriginX, y: this.segmentOriginY }
        : cellCenter(from);
    const b = cellCenter(to);
    const role = segmentEaseRole(this.index, this.path.length);
    const t = easeSegmentProgress(Math.min(1, Math.max(0, this.progress)), role);
    this.worldX = a.x + (b.x - a.x) * t;
    this.worldY = a.y + (b.y - a.y) * t;
  }

  /**
   * 2–3 fading crumb stamps along the active route (world feet positions).
   * Timing-invariant — samples geometry only.
   */
  pathTailCrumbs(count = 3): { x: number; y: number }[] {
    if (!this.isMoving || count <= 0) return [];
    const crumbs: { x: number; y: number }[] = [];
    const from = this.path[this.index];
    const to = this.path[this.index + 1];
    if (from && to) {
      const a =
        this.segmentOriginX != null && this.segmentOriginY != null
          ? { x: this.segmentOriginX, y: this.segmentOriginY }
          : cellCenter(from);
      const b = cellCenter(to);
      const role = segmentEaseRole(this.index, this.path.length);
      const eased = easeSegmentProgress(
        Math.min(1, Math.max(0, this.progress)),
        role,
      );
      for (let i = 1; i <= count; i += 1) {
        const u = Math.min(1, eased + (1 - eased) * (i / (count + 1)));
        crumbs.push({
          x: a.x + (b.x - a.x) * u,
          y: a.y + (b.y - a.y) * u,
        });
      }
      return crumbs;
    }
    return crumbs;
  }

  /** Neutral → left stride → neutral → right stride, phased by distance. */
  walkFrame(): number {
    if (!this.isMoving) return 0;
    const phase = Math.floor(this.distanceWalked * 4) % WALK_FRAME_SEQUENCE.length;
    return WALK_FRAME_SEQUENCE[phase]!;
  }

  private updateFacingFromSegment(): void {
    const from = this.path[this.index];
    const to = this.path[this.index + 1];
    if (!from || !to) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.facing = dx >= 0 ? 0 : 3;
    } else {
      this.facing = dy >= 0 ? 1 : 2;
    }
  }
}

function cellCenter(cell: GridPoint): { x: number; y: number } {
  return {
    x: cell.x * TILE_PX + TILE_PX / 2,
    y: cell.y * TILE_PX + TILE_PX / 2,
  };
}
