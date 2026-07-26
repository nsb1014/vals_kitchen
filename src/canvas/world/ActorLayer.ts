import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { getCharacterTexture } from '../../assets/loader.ts';
import { STARTER_DOOR } from '../../domain/floor/starter-map.ts';
import type { FloorDay, FloorGuest } from '../../domain/floor/types.ts';
import type { GridPoint } from '../../domain/floor/pathfinding.ts';
import { TILE_PX, gridToWorld } from '../coordinates.ts';
import { carryPlateGeometry } from './carry-plate.ts';
import { waitingGuestWorldPosition } from './waiting-line.ts';
import type { GuestMotion, GuestPose } from './GuestMotion.ts';
import { seatFacingToActorFacing, seatSitWorldPosition } from './seat-sit.ts';

export { carryPlateGeometry } from './carry-plate.ts';

/**
 * Characters ship as 32×32 (2× nearest-neighbor from Kenney 16×16).
 * Player and guests share one draw scale so they match each other and the
 * 32×48 furniture — earlier 2.5× / 1.75× made the cook a giant next to guests.
 * 1.3× → ~42px tall (~1.3 tiles), fits chairs without becoming unreadable.
 */
const ACTOR_SCALE = 1.3;
/** Fallback when atlas still has legacy 16×16 frames (16×2.6 ≈ 42px). */
const LEGACY_ACTOR_SCALE = 2.6;

const GUEST_STAGE_CUE: Record<string, number> = {
  entering: 0xffc857,
  waiting: 0xffc857,
  seated: 0x4a90d9,
  ordered: 0x9b59b6,
  eating: 0xe67e22,
  leaving: 0x95a5a6,
};

const FALLBACK_PLAYER_COLOR = 0x6a994e;
const FALLBACK_GUEST_COLOR = 0xffc857;
const DEST_MARKER_COLOR = 0xf0e6a8;
const LEAVING_DOOR_OFFSET_X = 4;

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

function scaleForTexture(texture: Texture, intended: number, legacy: number): number {
  // Pre-upscale atlas frames are 32×32; older 16×16 builds need a larger draw scale.
  return texture.height <= 16 ? legacy : intended;
}

export class ActorLayer {
  readonly view = new Container();
  private readonly markerLayer = new Graphics();
  private readonly actorContainer = new Container();
  private readonly playerSprite = new Sprite();
  private readonly playerFallback = new Graphics();
  private readonly plateGraphics = new Graphics();
  private readonly guestSprites = new Map<
    string,
    { root: Container; sprite: Sprite; cue: Graphics; lastFrameKey: string }
  >();
  private playerWorld = { x: 0, y: 0 };
  private playerFeetY = 0;
  private lastPlayerFrameKey = '';

  constructor() {
    this.view.sortableChildren = true;
    this.actorContainer.sortableChildren = true;
    this.playerSprite.roundPixels = true;
    this.playerSprite.anchor.set(0.5, 1);
    this.playerSprite.visible = false;
    this.actorContainer.addChild(this.playerSprite);
    this.actorContainer.addChild(this.playerFallback);
    this.actorContainer.addChild(this.plateGraphics);
    this.view.addChild(this.markerLayer);
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
      destination: GridPoint | null;
    },
    guestMotion?: GuestMotion | null,
  ): void {
    this.markerLayer.clear();
    if (!floor) {
      this.playerSprite.visible = false;
      this.playerFallback.clear();
      this.plateGraphics.clear();
      this.clearGuests();
      return;
    }

    this.drawDestination(nav.destination);
    this.syncGuests(floor, guestMotion ?? null);
    this.syncPlayer(nav);
    this.syncCarryPlate(floor.carriedTicketId != null);
    this.actorContainer.children.sort((a, b) => a.y - b.y);
  }

  getPlayerWorldPosition(): { x: number; y: number } {
    return { ...this.playerWorld };
  }

  private drawDestination(dest: GridPoint | null): void {
    if (!dest) return;
    const { x, y } = gridToWorld(dest.x, dest.y);
    const cx = x + TILE_PX / 2;
    const cy = y + TILE_PX / 2;
    this.markerLayer.circle(cx, cy, 5).stroke({ width: 2, color: DEST_MARKER_COLOR, alpha: 0.85 });
    this.markerLayer.circle(cx, cy, 2).fill({ color: DEST_MARKER_COLOR, alpha: 0.9 });
  }

  private syncPlayer(nav: {
    worldX: number;
    worldY: number;
    facing: 0 | 1 | 2 | 3;
    isMoving: boolean;
    walkFrame: () => number;
  }): void {
    this.playerWorld = { x: nav.worldX, y: nav.worldY };
    const facing = FACING_NAMES[nav.facing];
    const frame = nav.isMoving ? nav.walkFrame() : 0;
    const frameKey = `${facing}_${frame}`;
    const feetY = nav.worldY + TILE_PX / 2 - 2;
    this.playerFeetY = feetY;

    if (frameKey !== this.lastPlayerFrameKey) {
      this.lastPlayerFrameKey = frameKey;
      const texture =
        getCharacterTexture(`player_${facing}_${frame}`) ??
        getCharacterTexture(`player_${facing}_0`) ??
        getCharacterTexture('player') ??
        getCharacterTexture('customer');
      if (texture) {
        this.playerSprite.texture = texture;
        this.playerSprite.scale.set(scaleForTexture(texture, ACTOR_SCALE, LEGACY_ACTOR_SCALE));
        this.playerSprite.visible = true;
        this.playerFallback.clear();
      } else {
        this.playerSprite.visible = false;
      }
    }

    if (this.playerSprite.visible) {
      this.playerSprite.position.set(Math.round(nav.worldX), Math.round(feetY));
      this.playerSprite.zIndex = this.playerSprite.y;
    } else {
      this.playerFallback.clear();
      this.playerFallback.circle(Math.round(nav.worldX), Math.round(feetY) - 16, 12).fill(FALLBACK_PLAYER_COLOR);
      this.playerFallback.zIndex = feetY;
    }
  }

  private syncCarryPlate(carrying: boolean): void {
    this.plateGraphics.clear();
    if (!carrying) return;
    const geo = carryPlateGeometry({ x: this.playerWorld.x, y: this.playerFeetY });
    this.plateGraphics
      .ellipse(Math.round(geo.plate.x), Math.round(geo.plate.y), geo.plate.rx, geo.plate.ry)
      .fill(geo.plate.color);
    this.plateGraphics
      .circle(Math.round(geo.food.x), Math.round(geo.food.y), geo.food.r)
      .fill(geo.food.color);
    this.plateGraphics.zIndex = this.playerFeetY + 1;
  }

  private syncGuests(floor: FloorDay, guestMotion: GuestMotion | null): void {
    const seen = new Set<string>();
    let waitingIndex = 0;
    for (const guest of floor.pool) {
      if (guest.stage === 'done' || guest.stage === 'queued') continue;
      const waitIdx =
        guest.stage === 'waiting' || guest.stage === 'entering' ? waitingIndex++ : undefined;
      const pose = resolveGuestPose(guest, waitIdx, guestMotion);
      if (!pose) continue;
      seen.add(guest.id);
      let entry = this.guestSprites.get(guest.id);
      if (!entry) {
        const root = new Container();
        const sprite = new Sprite();
        sprite.roundPixels = true;
        sprite.anchor.set(0.5, 1);
        const cue = new Graphics();
        root.addChild(sprite);
        root.addChild(cue);
        this.actorContainer.addChild(root);
        entry = { root, sprite, cue, lastFrameKey: '' };
        this.guestSprites.set(guest.id, entry);
      }

      const variant = guestVariant(guest.id);
      const facingName = FACING_NAMES[pose.facing];
      const seated =
        pose.isSeated === true ||
        ((guest.stage === 'seated' || guest.stage === 'ordered' || guest.stage === 'eating') &&
          !pose.isMoving);
      const frame = seated ? 0 : pose.isMoving ? pose.walkFrame : 0;
      const frameKey = seated
        ? `sit_${variant}_${facingName}`
        : `${variant}_${facingName}_${frame}`;
      if (frameKey !== entry.lastFrameKey) {
        entry.lastFrameKey = frameKey;
        const texture = seated
          ? (getCharacterTexture(`guest_${variant}_sit_${facingName}`) ??
            getCharacterTexture(`guest_${variant}_${facingName}_0`) ??
            getCharacterTexture(`guest_${variant}_down_0`) ??
            getCharacterTexture(variant === 'a' ? 'customer' : 'customer_b'))
          : (getCharacterTexture(`guest_${variant}_${facingName}_${frame}`) ??
            getCharacterTexture(`guest_${variant}_${facingName}_0`) ??
            getCharacterTexture(`guest_${variant}_down_0`) ??
            getCharacterTexture(variant === 'a' ? 'customer' : 'customer_b'));
        if (texture) {
          entry.sprite.texture = texture;
          entry.sprite.scale.set(scaleForTexture(texture, ACTOR_SCALE, LEGACY_ACTOR_SCALE));
          entry.sprite.visible = true;
        } else {
          entry.sprite.visible = false;
        }
      }

      const feetY = pose.worldY + TILE_PX / 2 - 2;
      entry.root.position.set(Math.round(pose.worldX), Math.round(feetY));
      entry.root.zIndex = entry.root.y;
      entry.cue.clear();
      const cueColor = GUEST_STAGE_CUE[guest.stage];
      if (cueColor !== undefined) {
        entry.cue.circle(0, 3, 2).fill({ color: cueColor, alpha: 0.9 });
      }
      if (!entry.sprite.visible) {
        entry.cue.circle(0, -8, 8).fill(cueColor ?? FALLBACK_GUEST_COLOR);
      }
    }

    for (const [id, entry] of this.guestSprites) {
      if (seen.has(id)) continue;
      this.actorContainer.removeChild(entry.root);
      this.guestSprites.delete(id);
    }
  }

  private clearGuests(): void {
    for (const entry of this.guestSprites.values()) {
      this.actorContainer.removeChild(entry.root);
    }
    this.guestSprites.clear();
  }
}

function resolveGuestPose(
  guest: FloorGuest,
  waitingIndex: number | undefined,
  guestMotion: GuestMotion | null,
): GuestPose | null {
  const motionPose = guestMotion?.pose(guest.id) ?? null;
  if (motionPose) return motionPose;
  return fallbackGuestPose(guest, waitingIndex);
}

function fallbackGuestPose(
  guest: FloorGuest,
  waitingIndex?: number,
): GuestPose | null {
  if (guest.stage === 'seated' || guest.stage === 'ordered' || guest.stage === 'eating') {
    if (!guest.seat) return null;
    const sit = seatSitWorldPosition(guest.seat);
    return {
      worldX: sit.x,
      worldY: sit.y,
      facing: seatFacingToActorFacing(guest.seat.facing),
      isMoving: false,
      walkFrame: 0,
      isSeated: true,
    };
  }
  if (guest.stage === 'waiting' || guest.stage === 'entering') {
    const index = waitingIndex ?? 0;
    const door = STARTER_DOOR;
    const world =
      guest.stage === 'entering'
        ? tileCenter(door.x, door.y)
        : waitingGuestWorldPosition(door, index);
    return {
      worldX: world.x,
      worldY: world.y,
      facing: 1,
      isMoving: guest.stage === 'entering',
      walkFrame: 0,
    };
  }
  if (guest.stage === 'leaving') {
    const door = tileCenter(STARTER_DOOR.x, STARTER_DOOR.y);
    return {
      worldX: door.x + LEAVING_DOOR_OFFSET_X,
      worldY: door.y,
      facing: 1,
      isMoving: false,
      walkFrame: 0,
    };
  }
  return null;
}

export type { GridPoint };
