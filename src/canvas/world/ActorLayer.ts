import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { getCharacterTexture } from '../../assets/loader.ts';
import { STARTER_DOOR } from '../../domain/floor/starter-map.ts';
import type { FloorDay, FloorGuest } from '../../domain/floor/types.ts';
import type { GridPoint } from '../../domain/floor/pathfinding.ts';
import { TILE_PX, gridToWorld } from '../coordinates.ts';
import { carryPlateGeometry } from './carry-plate.ts';
import { nextBoundFrameKey } from './actor-texture-bind.ts';
import {
  guestSitFrameKey,
  guestVariant,
  guestWalkFrameKey,
  playerFrameKey,
} from './character-frames.ts';
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
    {
      root: Container;
      sprite: Sprite;
      cue: Graphics;
      badge: Graphics;
      badgeText: Text;
      lastFrameKey: string;
    }
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
    opts: { showPlayerWithoutFloor?: boolean } = {},
  ): void {
    this.markerLayer.clear();
    if (!floor) {
      this.clearGuests();
      this.plateGraphics.clear();
      if (opts.showPlayerWithoutFloor) {
        this.drawDestination(nav.destination);
        this.syncPlayer(nav);
        this.actorContainer.children.sort((a, b) => a.y - b.y);
        return;
      }
      this.playerSprite.visible = false;
      this.playerFallback.clear();
      return;
    }

    this.drawDestination(nav.destination);
    this.syncGuests(floor, guestMotion ?? null);
    this.syncPlayer(nav);
    this.syncCarryPlate(floor.carriedTicketId != null, nav.facing);
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

    if (
      nextBoundFrameKey({
        frameKey,
        lastFrameKey: this.lastPlayerFrameKey,
        hadTexture: this.playerSprite.visible,
      })
    ) {
      const texture =
        getCharacterTexture(playerFrameKey(facing, frame)) ??
        getCharacterTexture(playerFrameKey(facing, 0)) ??
        getCharacterTexture('player') ??
        getCharacterTexture('customer');
      if (texture) {
        this.lastPlayerFrameKey = frameKey;
        this.playerSprite.texture = texture;
        this.playerSprite.scale.set(scaleForTexture(texture, ACTOR_SCALE, LEGACY_ACTOR_SCALE));
        this.playerSprite.visible = true;
        this.playerFallback.clear();
      } else {
        // Leave lastPlayerFrameKey stale/empty so the next sync retries after atlas load.
        this.lastPlayerFrameKey = '';
        this.playerSprite.visible = false;
      }
    }

    if (this.playerSprite.visible) {
      this.playerSprite.position.set(Math.round(nav.worldX), Math.round(feetY));
      this.playerSprite.zIndex = this.playerSprite.y;
    } else {
      this.playerFallback.clear();
      this.playerFallback.y = feetY;
      this.playerFallback.circle(Math.round(nav.worldX), -16, 12).fill(FALLBACK_PLAYER_COLOR);
      this.playerFallback.zIndex = feetY;
    }
  }

  private syncCarryPlate(carrying: boolean, facing: 0 | 1 | 2 | 3): void {
    this.plateGraphics.clear();
    if (!carrying) {
      this.plateGraphics.y = 0;
      return;
    }
    const facingName = FACING_NAMES[facing];
    const geo = carryPlateGeometry({ x: this.playerWorld.x, y: this.playerFeetY }, facingName);
    if (!geo.visible) {
      // Facing up: plate is behind the cook — omit rather than punch through the torso.
      this.plateGraphics.y = 0;
      return;
    }
    // Geometry is world-space; shift local Y so container.y participates in feet sort
    // and the plate paints in front of the body (not under it at y=0).
    this.plateGraphics.y = geo.sortY;
    this.plateGraphics.zIndex = geo.sortY;
    const plateLocalY = geo.plate.y - geo.sortY;
    const foodLocalY = geo.food.y - geo.sortY;
    this.plateGraphics
      .ellipse(Math.round(geo.plate.x), Math.round(plateLocalY), geo.plate.rx, geo.plate.ry)
      .fill(geo.plate.color);
    this.plateGraphics
      .circle(Math.round(geo.food.x), Math.round(foodLocalY), geo.food.r)
      .fill(geo.food.color);
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
        const badge = new Graphics();
        const badgeText = new Text({
          text: '',
          style: {
            fill: 0x241b17,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 9,
            fontWeight: '700',
          },
        });
        badgeText.anchor.set(0.5);
        root.addChild(sprite);
        root.addChild(cue);
        root.addChild(badge);
        root.addChild(badgeText);
        this.actorContainer.addChild(root);
        entry = { root, sprite, cue, badge, badgeText, lastFrameKey: '' };
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
        ? guestSitFrameKey(variant, facingName)
        : guestWalkFrameKey(variant, facingName, frame);
      if (
        nextBoundFrameKey({
          frameKey,
          lastFrameKey: entry.lastFrameKey,
          hadTexture: entry.sprite.visible,
        })
      ) {
        const texture = seated
          ? (getCharacterTexture(guestSitFrameKey(variant, facingName)) ??
            getCharacterTexture(guestWalkFrameKey(variant, facingName, 0)) ??
            getCharacterTexture(guestWalkFrameKey(variant, 'down', 0)) ??
            getCharacterTexture('customer'))
          : (getCharacterTexture(guestWalkFrameKey(variant, facingName, frame)) ??
            getCharacterTexture(guestWalkFrameKey(variant, facingName, 0)) ??
            getCharacterTexture(guestWalkFrameKey(variant, 'down', 0)) ??
            getCharacterTexture('customer'));
        if (texture) {
          entry.lastFrameKey = frameKey;
          entry.sprite.texture = texture;
          entry.sprite.scale.set(scaleForTexture(texture, ACTOR_SCALE, LEGACY_ACTOR_SCALE));
          entry.sprite.visible = true;
        } else {
          entry.lastFrameKey = '';
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

      const guestNumber = floor.pool.findIndex(
        (candidate) => candidate.customer.id === guest.customer.id,
      ) + 1;
      const showOrderBadge =
        guest.stage === 'seated' ||
        guest.stage === 'ordered' ||
        guest.stage === 'eating';
      entry.badge.clear();
      entry.badge.visible = showOrderBadge;
      entry.badgeText.visible = showOrderBadge;
      if (showOrderBadge) {
        entry.badge
          .circle(0, -43, 8)
          .fill({ color: 0xf0d27a, alpha: 0.98 })
          .stroke({ width: 1.5, color: 0x241b17, alpha: 0.9 });
        entry.badgeText.text = String(Math.max(1, guestNumber));
        entry.badgeText.position.set(0, -43);
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
