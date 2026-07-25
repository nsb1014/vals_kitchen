import type { GridPoint } from '../../domain/floor/pathfinding.ts';

/** Pure path follower for canvas — unit-testable without Pixi. */
export class NavController {
  private path: GridPoint[] = [];
  private index = 0;
  private readonly speedTilesPerMs: number;
  private progress = 0;
  position: GridPoint;

  constructor(start: GridPoint, speedTilesPerSecond = 4) {
    this.position = { ...start };
    this.speedTilesPerMs = speedTilesPerSecond / 1000;
  }

  setPath(path: GridPoint[]): void {
    this.path = path.length > 0 ? path.slice() : [];
    this.index = 0;
    this.progress = 0;
    if (this.path[0]) this.position = { ...this.path[0] };
  }

  get isMoving(): boolean {
    return this.path.length > 0 && this.index < this.path.length - 1;
  }

  update(dtMs: number): void {
    if (!this.isMoving) return;
    this.progress += this.speedTilesPerMs * dtMs;
    while (this.progress >= 1 && this.isMoving) {
      this.progress -= 1;
      this.index += 1;
      const cell = this.path[this.index];
      if (cell) this.position = { ...cell };
    }
  }
}
