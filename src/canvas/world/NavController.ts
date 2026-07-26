import type { GridPoint } from '../../domain/floor/pathfinding.ts';
import { TILE_PX } from '../coordinates.ts';

/** Pure path follower — interpolates world position between grid cells. */
export class NavController {
  private path: GridPoint[] = [];
  private index = 0;
  private readonly speedTilesPerMs: number;
  /** Progress 0..1 within the current segment (from path[index] → path[index+1]). */
  private progress = 0;
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

  snapTo(cell: GridPoint): void {
    this.path = [];
    this.index = 0;
    this.progress = 0;
    this.position = { ...cell };
    const world = cellCenter(cell);
    this.worldX = world.x;
    this.worldY = world.y;
  }

  setPath(path: GridPoint[]): void {
    if (path.length === 0) {
      this.path = [];
      this.index = 0;
      this.progress = 0;
      return;
    }
    const start = path[0]!;
    const sameCell = start.x === this.position.x && start.y === this.position.y;
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
    }
    this.updateFacingFromSegment();
  }

  update(dtMs: number): void {
    if (!this.isMoving) return;
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
      return;
    }
    const a = cellCenter(from);
    const b = cellCenter(to);
    const t = Math.min(1, Math.max(0, this.progress));
    this.worldX = a.x + (b.x - a.x) * t;
    this.worldY = a.y + (b.y - a.y) * t;
  }

  /** Walk-cycle frame 0..2 from distance traveled. */
  walkFrame(): number {
    if (!this.isMoving) return 0;
    return Math.floor(this.distanceWalked * 4) % 3;
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
