import { Container, Graphics } from 'pixi.js';
import type { FloorDay, FloorGuest } from '../../domain/floor/types.ts';
import type { GridPoint } from '../../domain/floor/pathfinding.ts';
import { gridToWorld, TILE_PX } from '../coordinates.ts';

const PLAYER_COLOR = 0x6a994e;
const GUEST_COLORS: Record<string, number> = {
  waiting: 0xffc857,
  seated: 0x4a90d9,
  ordered: 0x9b59b6,
  eating: 0xe67e22,
  leaving: 0x95a5a6,
  done: 0x555555,
};

function tileCenter(gx: number, gy: number): { x: number; y: number } {
  const { x, y } = gridToWorld(gx, gy);
  return { x: x + TILE_PX / 2, y: y + TILE_PX / 2 };
}

export class ActorLayer {
  readonly view = new Container();
  private playerGfx = new Graphics();
  private guestContainer = new Container();
  private playerWorld = { x: 0, y: 0 };

  constructor() {
    this.view.addChild(this.guestContainer);
    this.view.addChild(this.playerGfx);
  }

  sync(floor: FloorDay | null | undefined, navPosition: GridPoint): void {
    this.guestContainer.removeChildren();

    if (!floor) {
      this.playerGfx.clear();
      return;
    }

    for (const guest of floor.pool) {
      if (guest.stage === 'done') continue;
      const pos = guestPosition(guest);
      if (!pos) continue;
      const gfx = new Graphics();
      const color = GUEST_COLORS[guest.stage] ?? 0xffc857;
      gfx.circle(pos.x, pos.y, 8).fill(color);
      this.guestContainer.addChild(gfx);
    }

    const playerTile = navPosition;
    const center = tileCenter(playerTile.x, playerTile.y);
    this.playerWorld = center;
    this.playerGfx.clear();
    this.playerGfx.circle(center.x, center.y, 10).fill(PLAYER_COLOR);
    this.playerGfx.circle(center.x, center.y - 14, 7).fill(PLAYER_COLOR);
  }

  getPlayerWorldPosition(): { x: number; y: number } {
    return { ...this.playerWorld };
  }
}

function guestPosition(guest: FloorGuest): { x: number; y: number } | null {
  if (guest.seat) {
    return tileCenter(guest.seat.x, guest.seat.y);
  }
  if (guest.stage === 'waiting') {
    return tileCenter(3, 7);
  }
  return null;
}
