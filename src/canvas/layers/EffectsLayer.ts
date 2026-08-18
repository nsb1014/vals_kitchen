import { Container } from 'pixi.js';

export type EffectBurstKind = 'star' | 'steam' | 'coin' | 'dust';

/**
 * Floor-particle bursts are retired. Public methods stay so serve/review/door
 * call sites compile; celebration banners keep their CSS motion elsewhere.
 */
export class EffectsLayer {
  readonly view = new Container();

  constructor() {
    this.view.eventMode = 'none';
    this.view.sortableChildren = false;
  }

  spawnAtWorld(
    _kind: EffectBurstKind,
    _worldX: number,
    _worldY: number,
    _opts: { count?: number; spread?: number; profile?: 'default' | 'gentle' } = {},
  ): void {}

  spawnAtGrid(
    kind: EffectBurstKind,
    gx: number,
    gy: number,
    opts?: { count?: number; spread?: number; profile?: 'default' | 'gentle' },
  ): void {
    this.spawnAtWorld(kind, gx, gy, opts);
  }

  burstServe(_worldX: number, _worldY: number): void {}

  burstServePlace(worldX: number, worldY: number): void {
    this.burstServe(worldX, worldY);
  }

  burstReview(_worldX: number, _worldY: number): void {}

  burstPlacement(_worldX: number, _worldY: number): void {}

  burstDoorDust(gx: number, gy: number): void {
    this.spawnAtGrid('dust', gx, gy);
  }

  burstSteam(_worldX: number, _worldY: number): void {}

  update(_dtMs: number): void {}

  clear(): void {}

  getActiveCount(): number {
    return 0;
  }
}
