import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { getCharacterTexture } from '../../assets/loader.ts';
import type { FloorDay, FloorGuest } from '../../domain/floor/types.ts';
import type { GridPoint } from '../../domain/floor/pathfinding.ts';
import { ART_TILE_PX, TILE_PX, gridToWorld } from '../coordinates.ts';

/** Integer multiple of source art only — fractional scales muddy Kenney pixels. */
const ACTOR_SCALE = TILE_PX / ART_TILE_PX; // 2

const GUEST_STAGE_CUE: Record<string, number> = {
  waiting: 0xffc857,
  seated: 0x4a90d9,
  ordered: 0x9b59b6,
  eating: 0xe67e22,
  leaving: 0x95a5a6,
};

const FALLBACK_PLAYER_COLOR = 0x6a994e;
const FALLBACK_GUEST_COLOR = 0xffc857;

const FACING_NAMES = ['right', 'down', 'up', 'left'] as const;

function tileCenter(gx: number, gy: number): { x: number; y: number } {
  const { x, y } = gridToWorld(gx, gy);
  return { x: x + TILE_PX / 2, y: y + TILE_PX / 2 };
}

function guestVariant(guestId: string): 'a' | 'b' {
  let hash = 0;
  for (let i = 0; i < guestId.length; i += 1) {
    hash = (hash * 31 + guestId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2 === 0 ? 'a' : 'b';
}

export class ActorLayer {
  readonly view = new Container();
  private actorContainer = new Container();
  private playerWorld = { x: 0, y: 0 };

  constructor() {
    this.view.sortableChildren = true;
    this.actorContainer.sortableChildren = true;
    this.view.addChild(this.actorContainer);
  }

  sync(
    floor: FloorDay | null | undefined,
    nav: {
      worldX: number;
      worldY: number;
      facing: 0 | 1 | 2 | 3;
      isMoving: boolean;
      walkFrame: () => number;
    },
  ): void {
    this.actorContainer.removeChildren();
    if (!floor) return;

    for (const guest of floor.pool) {
      if (guest.stage === 'done') continue;
      const pos = guestPosition(guest);
      if (!pos) continue;
      const variant = guestVariant(guest.id);
      const texture =
        getCharacterTexture(`guest_${variant}_down_0`) ??
        getCharacterTexture(variant === 'a' ? 'customer' : 'customer_b');
      const feetY = pos.y + TILE_PX / 2 - 2;
      if (texture) {
        placeActor(this.actorContainer, texture, pos.x, feetY, GUEST_STAGE_CUE[guest.stage]);
      } else {
        placeFallback(this.actorContainer, pos.x, feetY, GUEST_STAGE_CUE[guest.stage] ?? FALLBACK_GUEST_COLOR);
      }
    }

    this.playerWorld = { x: nav.worldX, y: nav.worldY };
    const facing = FACING_NAMES[nav.facing];
    const frame = nav.isMoving ? nav.walkFrame() : 0;
    const walkName = `player_${facing}_${frame}`;
    const idleName = `player_${facing}_0`;
    const playerTexture =
      getCharacterTexture(walkName) ??
      getCharacterTexture(idleName) ??
      getCharacterTexture('player') ??
      getCharacterTexture('customer');
    const feetY = nav.worldY + TILE_PX / 2 - 2;
    if (playerTexture) {
      placeActor(this.actorContainer, playerTexture, nav.worldX, feetY);
    } else {
      placeFallback(this.actorContainer, nav.worldX, feetY, FALLBACK_PLAYER_COLOR);
    }

    this.actorContainer.children.sort((a, b) => a.y - b.y);
  }

  getPlayerWorldPosition(): { x: number; y: number } {
    return { ...this.playerWorld };
  }
}

function placeActor(
  container: Container,
  texture: Texture,
  feetX: number,
  feetY: number,
  stageCue?: number,
): void {
  const wrapper = new Container();
  const sprite = new Sprite(texture);
  sprite.roundPixels = true;
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(ACTOR_SCALE);
  wrapper.addChild(sprite);
  if (stageCue !== undefined) {
    const cue = new Graphics();
    cue.circle(0, 3, 2).fill({ color: stageCue, alpha: 0.9 });
    wrapper.addChild(cue);
  }
  wrapper.position.set(Math.round(feetX), Math.round(feetY));
  wrapper.zIndex = wrapper.y;
  container.addChild(wrapper);
}

function placeFallback(container: Container, feetX: number, feetY: number, color: number): void {
  const gfx = new Graphics();
  gfx.circle(Math.round(feetX), Math.round(feetY) - 8, 8).fill(color);
  gfx.zIndex = feetY;
  container.addChild(gfx);
}

function guestPosition(guest: FloorGuest): { x: number; y: number } | null {
  if (guest.seat) return tileCenter(guest.seat.x, guest.seat.y);
  if (guest.stage === 'waiting') return tileCenter(3, 7);
  return null;
}

// silence unused GridPoint import if tree-shaken — kept for call-site typing clarity
export type { GridPoint };
