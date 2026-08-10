import { Container, Sprite } from 'pixi.js';
import { getTileTexture } from '../../assets/loader.ts';
import { gridToWorld, TILE_PX } from '../coordinates.ts';

export type EffectBurstKind = 'star' | 'steam' | 'coin' | 'dust';

interface ActiveBurst {
  sprite: Sprite;
  ageMs: number;
  lifeMs: number;
  vx: number;
  vy: number;
  spin: number;
  startScale: number;
  endScale: number;
}

const TEXTURE_NAME: Record<EffectBurstKind, 'fx_star' | 'fx_steam' | 'fx_coin' | 'fx_dust'> = {
  star: 'fx_star',
  steam: 'fx_steam',
  coin: 'fx_coin',
  dust: 'fx_dust',
};

/** Raised for denser serve/review showers while staying pooled. */
const POOL_CAP = 72;

/**
 * Short-lived atlas bursts for serve / review / placement juice.
 * Pure presentation — no gameplay coupling.
 * Ticker path (`update`) mutates pooled sprites only — no allocations.
 */
export class EffectsLayer {
  readonly view = new Container();
  private readonly active: ActiveBurst[] = [];
  private readonly pool: Sprite[] = [];
  private readonly burstPool: ActiveBurst[] = [];

  constructor() {
    this.view.eventMode = 'none';
    this.view.sortableChildren = false;
  }

  spawnAtWorld(
    kind: EffectBurstKind,
    worldX: number,
    worldY: number,
    opts: { count?: number; spread?: number } = {},
  ): void {
    const count = opts.count ?? (kind === 'dust' ? 6 : 4);
    const spread = opts.spread ?? 12;
    for (let i = 0; i < count; i += 1) {
      this.spawnOne(
        kind,
        worldX + (Math.random() - 0.5) * spread * 2,
        worldY + (Math.random() - 0.5) * spread,
      );
    }
  }

  spawnAtGrid(
    kind: EffectBurstKind,
    gx: number,
    gy: number,
    opts?: { count?: number; spread?: number },
  ): void {
    const { x, y } = gridToWorld(gx, gy);
    this.spawnAtWorld(kind, x + TILE_PX / 2, y + TILE_PX / 2, opts);
  }

  /** Serve / review star shower above the player feet. */
  burstServe(worldX: number, worldY: number): void {
    this.spawnAtWorld('star', worldX, worldY - 18, { count: 8, spread: 18 });
    this.spawnAtWorld('coin', worldX, worldY - 10, { count: 3, spread: 10 });
  }

  burstReview(worldX: number, worldY: number): void {
    this.spawnAtWorld('star', worldX, worldY - 22, { count: 9, spread: 20 });
    this.spawnAtWorld('coin', worldX, worldY - 14, { count: 2, spread: 12 });
  }

  burstPlacement(worldX: number, worldY: number): void {
    this.spawnAtWorld('dust', worldX, worldY - 4, { count: 6, spread: 14 });
  }

  burstDoorDust(gx: number, gy: number): void {
    this.spawnAtGrid('dust', gx, gy, { count: 7, spread: 11 });
  }

  burstSteam(worldX: number, worldY: number): void {
    this.spawnAtWorld('steam', worldX, worldY - 10, { count: 2, spread: 6 });
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const burst = this.active[i]!;
      burst.ageMs += dtMs;
      const t = Math.min(1, burst.ageMs / burst.lifeMs);
      const sprite = burst.sprite;
      sprite.x += burst.vx * dt;
      sprite.y += burst.vy * dt;
      sprite.rotation += burst.spin * dt;
      const scale = burst.startScale + (burst.endScale - burst.startScale) * t;
      sprite.scale.set(scale);
      sprite.alpha = 1 - t;
      if (t >= 1) {
        this.view.removeChild(sprite);
        this.release(sprite);
        this.releaseBurst(burst);
        this.active.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const burst of this.active) {
      this.view.removeChild(burst.sprite);
      this.release(burst.sprite);
      this.releaseBurst(burst);
    }
    this.active.length = 0;
  }

  getActiveCount(): number {
    return this.active.length;
  }

  private spawnOne(kind: EffectBurstKind, x: number, y: number): void {
    if (this.active.length >= POOL_CAP) return;
    const texture = getTileTexture(TEXTURE_NAME[kind]);
    const sprite = this.acquire();
    if (texture) {
      sprite.texture = texture;
      sprite.visible = true;
    } else {
      this.release(sprite);
      return;
    }
    sprite.anchor.set(0.5, 0.5);
    sprite.roundPixels = true;
    sprite.position.set(Math.round(x), Math.round(y));
    sprite.alpha = 1;
    sprite.rotation = 0;
    const startScale =
      kind === 'steam' ? 1.35 : kind === 'dust' ? 1.25 : kind === 'star' ? 0.95 : 0.85;
    sprite.scale.set(startScale);
    this.view.addChild(sprite);

    const upward = kind === 'steam' || kind === 'star' || kind === 'coin';
    const burst = this.acquireBurst();
    burst.sprite = sprite;
    burst.ageMs = 0;
    burst.lifeMs =
      kind === 'steam' ? 980 : kind === 'dust' ? 520 : kind === 'star' ? 700 : 620;
    burst.vx = (Math.random() - 0.5) * (kind === 'dust' ? 36 : 48);
    burst.vy = upward ? -22 - Math.random() * 34 : -8 - Math.random() * 14;
    burst.spin = (Math.random() - 0.5) * 4.5;
    burst.startScale = startScale;
    burst.endScale =
      kind === 'steam' ? 2.05 : kind === 'dust' ? 1.75 : kind === 'star' ? 1.45 : 1.3;
    this.active.push(burst);
  }

  private acquire(): Sprite {
    return this.pool.pop() ?? new Sprite();
  }

  private release(sprite: Sprite): void {
    sprite.visible = false;
    if (this.pool.length < POOL_CAP) this.pool.push(sprite);
  }

  private acquireBurst(): ActiveBurst {
    return (
      this.burstPool.pop() ?? {
        sprite: null as unknown as Sprite,
        ageMs: 0,
        lifeMs: 0,
        vx: 0,
        vy: 0,
        spin: 0,
        startScale: 1,
        endScale: 1,
      }
    );
  }

  private releaseBurst(burst: ActiveBurst): void {
    if (this.burstPool.length < POOL_CAP) this.burstPool.push(burst);
  }
}
