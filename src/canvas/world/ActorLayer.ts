import { Container, Graphics, Sprite } from 'pixi.js';
import {
  getCharacterContentBounds,
  getCharacterTexture,
} from '../../assets/loader.ts';
import { STARTER_DOOR } from '../../domain/floor/starter-map.ts';
import type { FloorDay, FloorGuest } from '../../domain/floor/types.ts';
import type { GridPoint } from '../../domain/floor/pathfinding.ts';
import { TILE_PX, gridToWorld } from '../coordinates.ts';
import { carryPlateGeometry } from './carry-plate.ts';
import { nextBoundFrameKey } from './actor-texture-bind.ts';
import type {
  GuestHitTargetCandidate,
  GuestWorldBounds,
} from './guest-hit.ts';
import { anchoredSpriteContentWorldBounds } from './guest-hit.ts';
import {
  GUEST_DISPLAY_HEIGHT,
  GUEST_SIT_CONTENT_HEIGHT_PX,
  GUEST_WALK_CONTENT_HEIGHT_PX,
  PLAYER_CONTENT_HEIGHT_PX,
  PLAYER_DISPLAY_HEIGHT,
  SEATED_GUEST_DISPLAY_HEIGHT,
} from './actor-metrics.ts';
import {
  guestSitFrameKey,
  guestVariant,
  guestWalkFrameKey,
  playerPoseFrame,
  playerTextureKeyCandidates,
} from './character-frames.ts';
import { waitingGuestWorldPosition } from './waiting-line.ts';
import type { GuestMotion, GuestPose } from './GuestMotion.ts';
import { seatFacingToActorFacing, seatSitWorldPosition } from './seat-sit.ts';

export { carryPlateGeometry } from './carry-plate.ts';
export {
  GUEST_DISPLAY_HEIGHT,
  GUEST_SIT_CONTENT_HEIGHT_PX,
  GUEST_WALK_CONTENT_HEIGHT_PX,
  PLAYER_CONTENT_HEIGHT_PX,
  PLAYER_DISPLAY_HEIGHT,
  SEATED_GUEST_DISPLAY_HEIGHT,
} from './actor-metrics.ts';

const FALLBACK_PLAYER_COLOR = 0x6a994e;
const FALLBACK_GUEST_COLOR = 0xffc857;
const DEST_MARKER_COLOR = 0xf0e6a8;
const FACING_NAMES = ['right', 'down', 'up', 'left'] as const;

function tileCenter(gx: number, gy: number): { x: number; y: number } {
  const { x, y } = gridToWorld(gx, gy);
  return { x: x + TILE_PX / 2, y: y + TILE_PX / 2 };
}

function scaleForContent(displayHeight: number, contentHeight: number): number {
  return displayHeight / Math.max(1, contentHeight);
}

export class ActorLayer {
  readonly view = new Container();
  private readonly markerLayer = new Graphics();
  private readonly actorContainer: Container;
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
  private lastPlayerBoundTextureKey = '';
  private playerUsesCarryTexture = false;
  private plateOverlayVisible = false;

  constructor(actorContainer?: Container) {
    this.actorContainer = actorContainer ?? new Container();
    this.view.sortableChildren = true;
    this.actorContainer.sortableChildren = true;
    this.playerSprite.roundPixels = true;
    this.playerSprite.anchor.set(0.5, 1);
    this.playerSprite.alpha = 1;
    this.playerSprite.visible = false;
    this.actorContainer.addChild(this.playerSprite);
    this.actorContainer.addChild(this.playerFallback);
    this.actorContainer.addChild(this.plateGraphics);
    this.view.addChild(this.markerLayer);
    if (!actorContainer) this.view.addChild(this.actorContainer);
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
    opts: {
      showPlayerWithoutFloor?: boolean;
      showGuests?: boolean;
      playerCarrying?: boolean;
    } = {},
  ): void {
    this.markerLayer.clear();
    if (!floor) {
      this.clearGuests();
      if (opts.showPlayerWithoutFloor) {
        this.drawDestination(nav.destination);
        const carrying = opts.playerCarrying === true;
        const usesAuthoredCarryPose = this.syncPlayer(nav, carrying);
        this.syncCarryPlate(carrying && !usesAuthoredCarryPose, nav.facing);
        return;
      }
      this.syncCarryPlate(false, nav.facing);
      this.playerSprite.visible = false;
      this.playerFallback.clear();
      return;
    }

    this.drawDestination(nav.destination);
    if (opts.showGuests === false) {
      this.clearGuests();
    } else {
      this.syncGuests(floor, guestMotion ?? null);
    }
    const carrying = floor.carriedTicketId != null;
    const usesAuthoredCarryPose = this.syncPlayer(nav, carrying);
    this.syncCarryPlate(carrying && !usesAuthoredCarryPose, nav.facing);
  }

  getPlayerWorldPosition(): { x: number; y: number } {
    return { ...this.playerWorld };
  }

  getPlayerFeetWorldPosition(): { x: number; y: number } {
    return { x: this.playerWorld.x, y: this.playerFeetY };
  }

  getPlayerVisualDebug(): Readonly<{
    requestedTextureKey: string;
    boundTextureKey: string;
    authoredCarry: boolean;
    plateOverlayVisible: boolean;
    spriteVisible: boolean;
    spriteAlpha: number;
    frameWidth: number;
    frameHeight: number;
    scale: { x: number; y: number };
    feet: { x: number; y: number };
  }> {
    return {
      requestedTextureKey: this.lastPlayerFrameKey,
      boundTextureKey: this.lastPlayerBoundTextureKey,
      authoredCarry: this.playerUsesCarryTexture,
      plateOverlayVisible: this.plateOverlayVisible,
      spriteVisible: this.playerSprite.visible,
      spriteAlpha: this.playerSprite.alpha,
      frameWidth: this.playerSprite.visible ? this.playerSprite.texture.orig.width : 0,
      frameHeight: this.playerSprite.visible ? this.playerSprite.texture.orig.height : 0,
      scale: { x: this.playerSprite.scale.x, y: this.playerSprite.scale.y },
      feet: { x: this.playerWorld.x, y: this.playerFeetY },
    };
  }

  getGuestWorldPosition(guestId: string): { x: number; y: number } | null {
    const entry = this.guestSprites.get(guestId);
    if (!entry) return null;
    return {
      x: entry.root.x,
      y: entry.root.y - SEATED_GUEST_DISPLAY_HEIGHT,
    };
  }

  getGuestFeetWorldPosition(guestId: string): { x: number; y: number } | null {
    const entry = this.guestSprites.get(guestId);
    if (!entry) return null;
    return { x: entry.root.x, y: entry.root.y };
  }

  getGuestWorldHitTargets(): GuestHitTargetCandidate[] {
    // Pixi resolves equal z-index children by their current container order.
    // Sort first so hit resolution follows the exact order users can see.
    this.actorContainer.sortChildren();
    const targets: GuestHitTargetCandidate[] = [];
    for (const [guestId, entry] of this.guestSprites) {
      const bounds = this.guestEntryWorldBounds(entry);
      targets.push({
        guestId,
        bounds,
        sortY: entry.root.zIndex,
        paintOrder: this.actorContainer.getChildIndex(entry.root),
      });
    }
    return targets;
  }

  private guestEntryWorldBounds(
    entry: { root: Container; sprite: Sprite },
  ): GuestWorldBounds {
    if (entry.sprite.visible) {
      const texture = entry.sprite.texture;
      const content = getCharacterContentBounds(texture) ?? {
        x: 0,
        y: 0,
        w: texture.orig.width,
        h: texture.orig.height,
      };
      return anchoredSpriteContentWorldBounds({
        rootX: entry.root.x,
        rootY: entry.root.y,
        spriteX: entry.sprite.x,
        spriteY: entry.sprite.y,
        sourceWidth: texture.orig.width,
        sourceHeight: texture.orig.height,
        contentBounds: {
          left: content.x,
          top: content.y,
          right: content.x + content.w,
          bottom: content.y + content.h,
        },
        anchorX: entry.sprite.anchor.x,
        anchorY: entry.sprite.anchor.y,
        scaleX: entry.sprite.scale.x,
        scaleY: entry.sprite.scale.y,
      });
    }

    // Missing atlases draw an 8px fallback circle centered 8px above the
    // actor root. Keep its authored bounds, then let the pure hit policy grow
    // it to the shared minimum touch target.
    return {
      left: entry.root.x - 8,
      top: entry.root.y - 16,
      right: entry.root.x + 8,
      bottom: entry.root.y,
    };
  }

  private drawDestination(dest: GridPoint | null): void {
    if (!dest) return;
    const { x, y } = gridToWorld(dest.x, dest.y);
    const cx = x + TILE_PX / 2;
    const cy = y + TILE_PX / 2;
    this.markerLayer.circle(cx, cy, 5).stroke({ width: 2, color: DEST_MARKER_COLOR, alpha: 0.85 });
    this.markerLayer.circle(cx, cy, 2).fill({ color: DEST_MARKER_COLOR, alpha: 0.9 });
  }

  private syncPlayer(
    nav: {
      worldX: number;
      worldY: number;
      facing: 0 | 1 | 2 | 3;
      isMoving: boolean;
      walkFrame: () => number;
    },
    carrying: boolean,
  ): boolean {
    this.playerWorld = { x: nav.worldX, y: nav.worldY };
    const facing = FACING_NAMES[nav.facing];
    const frame = nav.isMoving ? nav.walkFrame() : 0;
    const pose = playerPoseFrame(facing, frame, nav.isMoving, carrying);
    const frameKey = pose.textureKey;
    const feetY = nav.worldY + TILE_PX / 2 - 2;
    this.playerFeetY = feetY;

    if (
      nextBoundFrameKey({
        frameKey,
        lastFrameKey: this.lastPlayerFrameKey,
        hadTexture: this.playerSprite.visible,
      }) || this.lastPlayerBoundTextureKey !== frameKey
    ) {
      const candidates = playerTextureKeyCandidates(facing, frame, nav.isMoving, carrying);
      let boundTextureKey = '';
      let texture = null;
      for (const candidate of candidates) {
        texture = getCharacterTexture(candidate);
        if (texture) {
          boundTextureKey = candidate;
          break;
        }
      }
      if (texture) {
        this.lastPlayerFrameKey = frameKey;
        this.lastPlayerBoundTextureKey = boundTextureKey;
        this.playerUsesCarryTexture = boundTextureKey.startsWith('player_carry_');
        this.playerSprite.texture = texture;
        this.playerSprite.scale.set(
          scaleForContent(PLAYER_DISPLAY_HEIGHT, PLAYER_CONTENT_HEIGHT_PX),
        );
        this.playerSprite.visible = true;
        this.playerFallback.clear();
      } else {
        // Leave lastPlayerFrameKey stale/empty so the next sync retries after atlas load.
        this.lastPlayerFrameKey = '';
        this.lastPlayerBoundTextureKey = '';
        this.playerUsesCarryTexture = false;
        this.playerSprite.visible = false;
      }
    }

    if (this.playerSprite.visible) {
      this.playerSprite.alpha = 1;
      this.playerSprite.scale.set(
        scaleForContent(PLAYER_DISPLAY_HEIGHT, PLAYER_CONTENT_HEIGHT_PX),
      );
      this.playerSprite.position.set(Math.round(nav.worldX), Math.round(feetY));
      this.playerSprite.zIndex = this.playerSprite.y;
    } else {
      this.playerFallback.clear();
      this.playerFallback.y = feetY;
      this.playerFallback.circle(Math.round(nav.worldX), -16, 12).fill(FALLBACK_PLAYER_COLOR);
      this.playerFallback.zIndex = feetY;
    }
    return carrying && this.playerUsesCarryTexture;
  }

  private syncCarryPlate(carrying: boolean, facing: 0 | 1 | 2 | 3): void {
    this.plateGraphics.clear();
    this.plateOverlayVisible = false;
    if (!carrying) {
      this.plateGraphics.y = 0;
      return;
    }
    const facingName = FACING_NAMES[facing];
    const geo = carryPlateGeometry({ x: this.playerWorld.x, y: this.playerFeetY }, facingName);
    if (!geo.visible) return;
    // Geometry is world-space; shift local Y so container.y participates in
    // feet sorting (the up-facing fallback paints behind the body).
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
    this.plateOverlayVisible = true;
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
        sprite.alpha = 1;
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
          entry.sprite.visible = true;
        } else {
          entry.lastFrameKey = '';
          entry.sprite.visible = false;
        }
      }

      if (entry.sprite.visible) {
        const contentH = seated ? GUEST_SIT_CONTENT_HEIGHT_PX : GUEST_WALK_CONTENT_HEIGHT_PX;
        const displayH = seated ? SEATED_GUEST_DISPLAY_HEIGHT : GUEST_DISPLAY_HEIGHT;
        entry.sprite.alpha = 1;
        entry.sprite.scale.set(scaleForContent(displayH, contentH));
      }

      const feetY = pose.worldY + TILE_PX / 2 - 2;
      entry.root.position.set(Math.round(pose.worldX), Math.round(feetY));
      // Natural feet Y-sort; flat tables sort under this band (see furnitureDepthY).
      entry.root.zIndex = entry.root.y;
      entry.cue.clear();
      if (!entry.sprite.visible) {
        entry.cue.circle(0, -8, 8).fill(FALLBACK_GUEST_COLOR);
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

export function resolveGuestPose(
  guest: FloorGuest,
  waitingIndex: number | undefined,
  guestMotion: GuestMotion | null,
): GuestPose | null {
  // Once the motion system is active its null is authoritative: it is used to
  // keep a deferred entrant offstage while a saved departure clears the door.
  if (guestMotion) return guestMotion.pose(guest.id);
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
  if (guest.stage === 'seating') {
    const world = waitingGuestWorldPosition(STARTER_DOOR, waitingIndex ?? 0);
    return {
      worldX: world.x,
      worldY: world.y,
      facing: 1,
      isMoving: true,
      walkFrame: 0,
      isSeated: false,
    };
  }
  if (guest.stage === 'leaving') {
    if (!guest.seat) return null;
    const seat = seatSitWorldPosition(guest.seat);
    return {
      worldX: seat.x,
      worldY: seat.y,
      facing: seatFacingToActorFacing(guest.seat.facing),
      isMoving: true,
      walkFrame: 0,
      isSeated: false,
    };
  }
  return null;
}

export type { GridPoint };
