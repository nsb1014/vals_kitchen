import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { getCharacterTexture } from '../../assets/loader.ts';
import type { FloorDay, FloorGuest } from '../../domain/floor/types.ts';
import type { GridPoint } from '../../domain/floor/pathfinding.ts';
import { gridToWorld, TILE_PX } from '../coordinates.ts';

const ACTOR_DISPLAY_H = 28;
const PLAYER_TINT = 0xffffff;
const GUEST_TEXTURES = ['customer', 'customer_b'] as const;

const GUEST_STAGE_CUE: Record<string, number> = {
  waiting: 0xffc857,
  seated: 0x4a90d9,
  ordered: 0x9b59b6,
  eating: 0xe67e22,
  leaving: 0x95a5a6,
};

const FALLBACK_PLAYER_COLOR = 0x6a994e;
const FALLBACK_GUEST_COLOR = 0xffc857;

function tileCenter(gx: number, gy: number): { x: number; y: number } {
  const { x, y } = gridToWorld(gx, gy);
  return { x: x + TILE_PX / 2, y: y + TILE_PX / 2 };
}

function guestTextureName(guestId: string): (typeof GUEST_TEXTURES)[number] {
  let hash = 0;
  for (let i = 0; i < guestId.length; i += 1) {
    hash = (hash * 31 + guestId.charCodeAt(i)) | 0;
  }
  return GUEST_TEXTURES[Math.abs(hash) % GUEST_TEXTURES.length];
}

function actorFeetY(centerY: number): number {
  return centerY + TILE_PX / 2 - 2;
}

function applySpriteActor(
  container: Container,
  texture: Texture,
  tint: number,
  feetX: number,
  feetY: number,
  stageCue?: number,
  scaleMultiplier = 1,
): void {
  const scale = (ACTOR_DISPLAY_H / texture.height) * scaleMultiplier;
  const wrapper = new Container();
  const sprite = new Sprite(texture);
  sprite.roundPixels = true;
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(scale);
  sprite.tint = tint;
  wrapper.addChild(sprite);

  if (stageCue !== undefined) {
    const cue = new Graphics();
    cue.circle(0, 4, 3).fill({ color: stageCue, alpha: 0.85 });
    wrapper.addChild(cue);
  }

  wrapper.position.set(feetX, feetY);
  container.addChild(wrapper);
}

function applyFallbackCircle(
  container: Container,
  feetX: number,
  feetY: number,
  color: number,
  radius: number,
): void {
  const gfx = new Graphics();
  gfx.circle(feetX, feetY - radius, radius).fill(color);
  container.addChild(gfx);
}

export class ActorLayer {
  readonly view = new Container();
  private actorContainer = new Container();
  private playerWorld = { x: 0, y: 0 };
  private walkPhase = 0;

  constructor() {
    this.view.sortableChildren = true;
    this.actorContainer.sortableChildren = true;
    this.view.addChild(this.actorContainer);
  }

  sync(floor: FloorDay | null | undefined, navPosition: GridPoint, isMoving = false): void {
    this.actorContainer.removeChildren();

    if (!floor) {
      return;
    }

    if (isMoving) {
      this.walkPhase = (this.walkPhase + 1) % 2;
    } else {
      this.walkPhase = 0;
    }

    for (const guest of floor.pool) {
      if (guest.stage === 'done') continue;
      const pos = guestPosition(guest);
      if (!pos) continue;

      const texture = getCharacterTexture(guestTextureName(guest.id));
      const feetY = actorFeetY(pos.y);
      if (texture) {
        applySpriteActor(
          this.actorContainer,
          texture,
          0xffffff,
          pos.x,
          feetY,
          GUEST_STAGE_CUE[guest.stage],
        );
      } else {
        applyFallbackCircle(
          this.actorContainer,
          pos.x,
          feetY,
          GUEST_STAGE_CUE[guest.stage] ?? FALLBACK_GUEST_COLOR,
          8,
        );
      }
    }

    const playerTile = navPosition;
    const center = tileCenter(playerTile.x, playerTile.y);
    this.playerWorld = center;
    const playerFeetY = actorFeetY(center.y);
    const walkTexture = getCharacterTexture('player_walk');
    const idleTexture = getCharacterTexture('player') ?? getCharacterTexture('customer');
    const playerTexture =
      isMoving && this.walkPhase === 1 && walkTexture ? walkTexture : idleTexture;
    const playerBob = isMoving && !walkTexture ? (this.walkPhase === 0 ? 1 : 1.06) : 1;

    if (playerTexture) {
      applySpriteActor(
        this.actorContainer,
        playerTexture,
        PLAYER_TINT,
        center.x,
        playerFeetY,
        undefined,
        playerBob,
      );
    } else {
      applyFallbackCircle(this.actorContainer, center.x, playerFeetY, FALLBACK_PLAYER_COLOR, 10);
      applyFallbackCircle(this.actorContainer, center.x, playerFeetY - 14, FALLBACK_PLAYER_COLOR, 7);
    }

    this.actorContainer.children.sort((a, b) => a.y - b.y);
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
