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

const POOL_CAP = 48;

/**
 * Short-lived atlas bursts for serve / review / placement juice.
 * Pure presentation — no gameplay coupling.
 */
export class EffectsLayer {
  readonly view = new Container();
  private readonly active: ActiveBurst[] = [];
  private readonly pool: Sprite[] = [];

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
    const count = opts.count ?? (kind === 'dust' ? 4 : 3);
    const spread = opts.spread ?? 10;
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
    this.spawnAtWorld('star', worldX, worldY - 18, { count: 5, spread: 14 });
    this.spawnAtWorld('coin', worldX, worldY - 10, { count: 2, spread: 8 });
  }

  burstReview(worldX: number, worldY: number): void {
    this.spawnAtWorld('star', worldX, worldY - 22, { count: 6, spread: 16 });
  }

  burstPlacement(worldX: number, worldY: number): void {
    this.spawnAtWorld('dust', worldX, worldY - 4, { count: 4, spread: 12 });
  }

  burstDoorDust(gx: number, gy: number): void {
    this.spawnAtGrid('dust', gx, gy, { count: 4, spread: 8 });
  }

  burstSteam(worldX: number, worldY: number): void {
    this.spawnAtWorld('steam', worldX, worldY - 8, { count: 1, spread: 4 });
  }

  update(dtMs: number): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const burst = this.active[i]!;
      burst.ageMs += dtMs;
      const t = Math.min(1, burst.ageMs / burst.lifeMs);
      const sprite = burst.sprite;
      sprite.x += burst.vx * (dtMs / 1000);
      sprite.y += burst.vy * (dtMs / 1000);
      sprite.rotation += burst.spin * (dtMs / 1000);
      const scale = burst.startScale + (burst.endScale - burst.startScale) * t;
      sprite.scale.set(scale);
      sprite.alpha = 1 - t;
      if (t >= 1) {
        this.view.removeChild(sprite);
        this.release(sprite);
        this.active.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const burst of this.active) {
      this.view.removeChild(burst.sprite);
      this.release(burst.sprite);
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
      // Atlas not ready — skip without leaving a white quad.
      this.release(sprite);
      return;
    }
    sprite.anchor.set(0.5, 0.5);
    sprite.roundPixels = true;
    sprite.position.set(Math.round(x), Math.round(y));
    sprite.alpha = 1;
    sprite.rotation = 0;
    const startScale = kind === 'steam' ? 0.9 : 0.7;
    sprite.scale.set(startScale);
    this.view.addChild(sprite);

    const upward = kind === 'steam' || kind === 'star' || kind === 'coin';
    this.active.push({
      sprite,
      ageMs: 0,
      lifeMs: kind === 'steam' ? 700 : kind === 'dust' ? 380 : 520,
      vx: (Math.random() - 0.5) * (kind === 'dust' ? 28 : 40),
      vy: upward ? -18 - Math.random() * 28 : -6 - Math.random() * 10,
      spin: (Math.random() - 0.5) * 4,
      startScale,
      endScale: kind === 'steam' ? 1.35 : 1.15,
    });
  }

  private acquire(): Sprite {
    return this.pool.pop() ?? new Sprite();
  }

  private release(sprite: Sprite): void {
    sprite.visible = false;
    if (this.pool.length < POOL_CAP) this.pool.push(sprite);
  }
}
