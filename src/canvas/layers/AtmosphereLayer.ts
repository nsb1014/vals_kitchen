import { Container, Graphics } from 'pixi.js';
import { TILE_PX } from '../coordinates.ts';
import {
  isKitchenCell,
  mapZonesForGrid,
  type FloorRoomId,
} from '../../domain/floor/starter-map.ts';

/** Floor wash/vignette retired with the rest of the juice pass. */
export const ATMOSPHERE_ENABLED = false;

/**
 * Warm dining vignette + cooler kitchen wash. Sits above floor tiles, below
 * furniture/actors. Slow sine on alpha for ambient life without lamp sprites.
 */
export class AtmosphereLayer {
  readonly view = new Container();
  private readonly vignette = new Graphics();
  private readonly kitchenWash = new Graphics();
  private lastKey = '';
  private phase = 0;

  constructor() {
    this.view.eventMode = 'none';
    this.view.addChild(this.kitchenWash);
    this.view.addChild(this.vignette);
  }

  sync(
    gridW: number,
    gridH: number,
    opts: { room?: FloorRoomId; kitchenAnnexOwned?: boolean } = {},
  ): void {
    const room: FloorRoomId = opts.room ?? 'main';
    const key = `${gridW}x${gridH}:${room}:${Boolean(opts.kitchenAnnexOwned)}`;
    if (!ATMOSPHERE_ENABLED) {
      this.clear();
      return;
    }
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.vignette.clear();
    this.kitchenWash.clear();

    const worldW = gridW * TILE_PX;
    const worldH = gridH * TILE_PX;

    // Soft warm center glow (dining coziness).
    this.vignette
      .rect(0, 0, worldW, worldH)
      .fill({ color: 0x2a1810, alpha: 0.22 });
    const insetX = worldW * 0.12;
    const insetY = worldH * 0.1;
    this.vignette
      .roundRect(insetX, insetY, worldW - insetX * 2, worldH - insetY * 2, 28)
      .fill({ color: 0xc4a35a, alpha: 0.07 });

    if (room !== 'main') return;

    const zones = mapZonesForGrid(gridW, gridH, { room });
    for (let gy = 0; gy < gridH; gy += 1) {
      for (let gx = 0; gx < gridW; gx += 1) {
        if (!isKitchenCell(zones, gx, gy)) continue;
        this.kitchenWash
          .rect(gx * TILE_PX, gy * TILE_PX, TILE_PX, TILE_PX)
          .fill({ color: 0x6a7a88, alpha: 0.08 });
      }
    }
  }

  update(dtMs: number): void {
    if (!ATMOSPHERE_ENABLED) return;
    this.phase += dtMs / 1000;
    const breathe = 0.92 + 0.08 * Math.sin(this.phase * 0.7);
    this.vignette.alpha = breathe;
    this.kitchenWash.alpha = 0.85 + 0.15 * Math.sin(this.phase * 0.55 + 1.2);
  }

  clear(): void {
    this.lastKey = '';
    this.vignette.clear();
    this.kitchenWash.clear();
  }
}
