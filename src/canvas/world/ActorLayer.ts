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
import { waitingGuestWorldPosition, queueLineAdvancePosition } from './waiting-line.ts';
import type { GuestMotion, GuestPose } from './GuestMotion.ts';
import { seatFacingToActorFacing, seatSitWorldPosition } from './seat-sit.ts';
import {
  guestCanvasCueAction,
  guestStageFloorCue,
  type CarriedDishRelation,
} from './guest-interaction-hint.ts';
import { canEnqueue } from '../../domain/floor/tickets.ts';
import { prefersReducedMotion } from '../../ui/presentation/motion-preference.ts';

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
const DEST_MARKER_COLOR = 0xfff1a8;
const DEST_MARKER_STROKE = 0xc4a35a;
const CUE_ORDER_COLOR = 0xf4d35e;
const CUE_DELIVER_COLOR = 0xe07a5f;
const CUE_EATING_COLOR = 0x9ad0c2;
const CUE_LEAVING_COLOR = 0xcfcfcf;
const QUEUED_SILHOUETTE_COLOR = 0x4a3f35;
const FACING_NAMES = ['right', 'down', 'up', 'left'] as const;
type ActorFacingName = (typeof FACING_NAMES)[number];

/** Walk-step squash duration (ms). Feet stay planted via bottom anchor. */
export const WALK_SQUASH_MS = 70;
/** Peak ± scale amplitude for walk squash/stretch (~5%). */
export const WALK_SQUASH_AMPLITUDE = 0.05;

export function walkStepSquash(
  t: number,
  amplitude = WALK_SQUASH_AMPLITUDE,
): { x: number; y: number } {
  const u = Math.max(0, Math.min(1, t));
  const wave = Math.sin(u * Math.PI);
  return {
    x: 1 + amplitude * wave,
    y: 1 - amplitude * wave,
  };
}

export function actorEatingPulse(
  nowMs: number,
  phase = 0,
): { scaleX: number; scaleY: number } {
  const chew = Math.sin(nowMs / 170 + phase);
  return {
    scaleX: 1 + chew * 0.035,
    scaleY: 1 - chew * 0.03,
  };
}

export function actorIdleBreathe(
  nowMs: number,
  phase = 0,
): { scaleX: number; scaleY: number } {
  const wave = Math.sin(nowMs / 520 + phase) * 0.018;
  return { scaleX: 1 + wave, scaleY: 1 - wave };
}

function hashPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h % 628) / 100;
}

interface WalkPulseState {
  lastFrame: number;
  startMs: number;
  active: boolean;
}

function resetWalkPulse(pulse: WalkPulseState): void {
  pulse.lastFrame = 0;
  pulse.startMs = 0;
  pulse.active = false;
}

function tickWalkPulse(
  pulse: WalkPulseState,
  walkFrame: number,
  isMoving: boolean,
  nowMs: number,
): { x: number; y: number } {
  if (!isMoving) {
    resetWalkPulse(pulse);
    return { x: 1, y: 1 };
  }
  if (walkFrame !== pulse.lastFrame) {
    pulse.lastFrame = walkFrame;
    pulse.startMs = nowMs;
    pulse.active = true;
  }
  if (!pulse.active) return { x: 1, y: 1 };
  const t = (nowMs - pulse.startMs) / WALK_SQUASH_MS;
  if (t >= 1) {
    pulse.active = false;
    return { x: 1, y: 1 };
  }
  return walkStepSquash(t);
}

interface GuestSpriteEntry {
  root: Container;
  content: Container;
  sprite: Sprite;
  cue: Graphics;
  cropMask: Graphics;
  doorwayCrop: GuestDoorwayCropDebug | null;
  /** Requested key last accepted by the texture-binding retry policy. */
  lastFrameKey: string;
  /** Requested pose for the current rendered tick, even while an atlas is loading. */
  requestedFrameKey: string;
  /** Exact texture candidate currently painted, including a deliberate fallback. */
  actualBoundFrameKey: string;
  isSeated: boolean;
  isMoving: boolean;
  facing: ActorFacingName;
  stage: FloorGuest['stage'] | null;
  walkPulse: WalkPulseState;
  phase: number;
  /** Queued silhouette slide-up after an admit (presentation only). */
  queueAdvance: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    startMs: number;
    active: boolean;
  } | null;
}

function tileCenter(gx: number, gy: number): { x: number; y: number } {
  const { x, y } = gridToWorld(gx, gy);
  return { x: x + TILE_PX / 2, y: y + TILE_PX / 2 };
}

function scaleForContent(displayHeight: number, contentHeight: number): number {
  return displayHeight / Math.max(1, contentHeight);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Visible top fraction while a moving guest crosses the south doorway.
 * The same northward progress gives arrivals 0 -> 1 and departures 1 -> 0.
 * Position remains authoritative at exact endpoints even after navigation
 * stops, so a guest at door center stays fully concealed until removal.
 */
export function doorwayGuestCropFraction(
  stage: FloorGuest['stage'],
  pose: Pick<GuestPose, 'worldY' | 'isMoving'>,
  door: GridPoint = STARTER_DOOR,
): number {
  if (stage !== 'entering' && stage !== 'leaving') {
    return 1;
  }

  const doorCenterY = tileCenter(door.x, door.y).y;
  const laneCenterY = tileCenter(door.x, Math.max(0, door.y - 1)).y;
  const doorwayTravel = doorCenterY - laneCenterY;
  if (doorwayTravel <= 0) return 1;
  return clampUnit((doorCenterY - pose.worldY) / doorwayTravel);
}

/** Clip translated content against the fixed north edge of the doorway. */
export function topClippedGuestWorldBoundsAtAperture(
  bounds: GuestWorldBounds,
  apertureWorldY: number,
): GuestWorldBounds | null {
  const bottom = Math.min(bounds.bottom, apertureWorldY);
  if (bottom <= bounds.top) return null;
  return {
    left: bounds.left,
    top: bounds.top,
    right: bounds.right,
    bottom,
  };
}

export interface GuestDoorwayCropDebug {
  /** Geographic doorway progress: 0 at door center, 1 at north lane center. */
  progress: number;
  /** Top fraction of authored/fallback content currently painted. */
  visibleFraction: number;
  apertureWorldY: number;
  visualOffsetY: number;
  maskApplied: boolean;
  contentRenderable: boolean;
  unclippedWorldBounds: GuestWorldBounds;
  clippedWorldBounds: GuestWorldBounds | null;
}

/** Deterministic render/debug geometry for an active doorway crossing. */
export function guestDoorwayCropGeometry(
  bounds: GuestWorldBounds,
  stage: FloorGuest['stage'],
  pose: Pick<GuestPose, 'worldY' | 'isMoving'>,
  door: GridPoint = STARTER_DOOR,
): GuestDoorwayCropDebug | null {
  if (stage !== 'entering' && stage !== 'leaving') {
    return null;
  }
  const progress = doorwayGuestCropFraction(stage, pose, door);
  // Once the body is fully inside the north lane this is ordinary actor
  // rendering, not an active doorway threshold. Keeping the debug state null
  // also prevents full interior travel from implying that the door is busy.
  if (progress >= 1) return null;
  // Actor roots use a two-pixel feet inset. Align the aperture with the root
  // at the lane-center endpoint so full content arrives with zero visual
  // offset while the north doorway threshold remains fixed in world space.
  const apertureWorldY = door.y * TILE_PX - 2;
  const visualOffsetY =
    (apertureWorldY - bounds.top) * (1 - progress);
  const unclippedWorldBounds = {
    left: bounds.left,
    top: bounds.top + visualOffsetY,
    right: bounds.right,
    bottom: bounds.bottom + visualOffsetY,
  };
  const clippedWorldBounds = topClippedGuestWorldBoundsAtAperture(
    unclippedWorldBounds,
    apertureWorldY,
  );
  const fullHeight = Math.max(0, bounds.bottom - bounds.top);
  const clippedHeight = clippedWorldBounds
    ? clippedWorldBounds.bottom - clippedWorldBounds.top
    : 0;
  return {
    progress,
    visibleFraction: fullHeight > 0
      ? clampUnit(clippedHeight / fullHeight)
      : 0,
    apertureWorldY,
    visualOffsetY,
    maskApplied: true,
    contentRenderable: clippedWorldBounds !== null,
    unclippedWorldBounds,
    clippedWorldBounds,
  };
}

export class ActorLayer {
  readonly view = new Container();
  private readonly markerLayer = new Graphics();
  private readonly actorContainer: Container;
  private readonly playerSprite = new Sprite();
  private readonly playerFallback = new Graphics();
  private readonly plateGraphics = new Graphics();
  private readonly guestSprites = new Map<string, GuestSpriteEntry>();
  private playerWorld = { x: 0, y: 0 };
  private playerFeetY = 0;
  private lastPlayerFrameKey = '';
  private lastPlayerBoundTextureKey = '';
  private playerUsesCarryTexture = false;
  private plateOverlayVisible = false;
  private readonly playerWalkPulse: WalkPulseState = {
    lastFrame: 0,
    startMs: 0,
    active: false,
  };

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
      pathTailCrumbs?: () => { x: number; y: number }[];
    },
    guestMotion?: GuestMotion | null,
    opts: {
      showPlayerWithoutFloor?: boolean;
      showGuests?: boolean;
      playerCarrying?: boolean;
      guestDoor?: GridPoint;
    } = {},
  ): void {
    this.markerLayer.clear();
    if (!floor) {
      this.clearGuests();
      if (opts.showPlayerWithoutFloor) {
        this.drawDestination(nav.destination, nav.facing, nav.pathTailCrumbs?.() ?? []);
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

    this.drawDestination(
      nav.destination,
      nav.facing,
      nav.pathTailCrumbs?.() ?? [],
    );
    if (opts.showGuests === false) {
      this.clearGuests();
    } else {
      this.syncGuests(
        floor,
        guestMotion ?? null,
        opts.guestDoor ?? STARTER_DOOR,
      );
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

  /** Narrow read-only actor state used to verify authored seating continuity. */
  getGuestVisualDebug(guestId: string): Readonly<{
    guestId: string;
    rootZIndex: number;
    paintOrder: number;
    inDepthParent: boolean;
    requestedFrameKey: string;
    actualBoundFrameKey: string;
    isSeated: boolean;
    isMoving: boolean;
    facing: ActorFacingName;
    visible: boolean;
    alpha: number;
    doorwayCrop: GuestDoorwayCropDebug | null;
    actualMaskWorldBounds: GuestWorldBounds | null;
    textureMatchesActualBoundFrame: boolean;
    feet: { x: number; y: number };
  }> | null {
    const entry = this.guestSprites.get(guestId);
    if (!entry) return null;
    this.actorContainer.sortChildren();
    return {
      guestId,
      rootZIndex: entry.root.zIndex,
      paintOrder: this.actorContainer.getChildIndex(entry.root),
      inDepthParent: entry.root.parent === this.actorContainer,
      requestedFrameKey: entry.requestedFrameKey,
      actualBoundFrameKey: entry.actualBoundFrameKey,
      isSeated: entry.isSeated,
      isMoving: entry.isMoving,
      facing: entry.facing,
      visible: entry.sprite.visible,
      alpha: entry.sprite.alpha,
      doorwayCrop: entry.doorwayCrop
        ? {
            ...entry.doorwayCrop,
            maskApplied: entry.content.mask === entry.cropMask,
            contentRenderable: entry.content.renderable,
            unclippedWorldBounds: { ...entry.doorwayCrop.unclippedWorldBounds },
            clippedWorldBounds: entry.doorwayCrop.clippedWorldBounds
              ? { ...entry.doorwayCrop.clippedWorldBounds }
              : null,
          }
        : null,
      actualMaskWorldBounds: this.guestActualMaskWorldBounds(entry),
      textureMatchesActualBoundFrame:
        entry.sprite.visible &&
        entry.actualBoundFrameKey.length > 0 &&
        entry.sprite.texture === getCharacterTexture(entry.actualBoundFrameKey),
      feet: { x: entry.root.x, y: entry.root.y },
    };
  }

  usesDepthParent(parent: Container): boolean {
    return this.actorContainer === parent;
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

  private drawDestination(
    dest: GridPoint | null,
    facing: 0 | 1 | 2 | 3 = 1,
    crumbs: { x: number; y: number }[] = [],
  ): void {
    for (let i = 0; i < crumbs.length; i += 1) {
      const crumb = crumbs[i]!;
      const alpha = 0.55 - i * 0.14;
      this.markerLayer
        .circle(crumb.x, crumb.y, 3.5 - i * 0.4)
        .fill({ color: DEST_MARKER_COLOR, alpha: Math.max(0.18, alpha) });
    }
    if (!dest) return;
    const { x, y } = gridToWorld(dest.x, dest.y);
    const cx = x + TILE_PX / 2;
    const cy = y + TILE_PX / 2;
    const size = 8;
    // Chevron / footprint stamp oriented by travel facing.
    const tips: [number, number][] =
      facing === 0
        ? [
            [cx + size, cy],
            [cx - size * 0.55, cy - size * 0.7],
            [cx - size * 0.2, cy],
            [cx - size * 0.55, cy + size * 0.7],
          ]
        : facing === 3
          ? [
              [cx - size, cy],
              [cx + size * 0.55, cy - size * 0.7],
              [cx + size * 0.2, cy],
              [cx + size * 0.55, cy + size * 0.7],
            ]
          : facing === 2
            ? [
                [cx, cy - size],
                [cx - size * 0.7, cy + size * 0.55],
                [cx, cy + size * 0.2],
                [cx + size * 0.7, cy + size * 0.55],
              ]
            : [
                [cx, cy + size],
                [cx - size * 0.7, cy - size * 0.55],
                [cx, cy - size * 0.2],
                [cx + size * 0.7, cy - size * 0.55],
              ];
    this.markerLayer
      .poly(tips.flat())
      .fill({ color: DEST_MARKER_COLOR, alpha: 0.92 })
      .stroke({ width: 2, color: DEST_MARKER_STROKE, alpha: 0.95 });
    this.markerLayer
      .circle(cx, cy, 2)
      .fill({ color: DEST_MARKER_STROKE, alpha: 0.85 });
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
    const nowMs = performance.now();
    const reduced = prefersReducedMotion();
    const squash = reduced
      ? { x: 1, y: 1 }
      : tickWalkPulse(this.playerWalkPulse, frame, nav.isMoving, nowMs);
    const breathe =
      reduced || nav.isMoving
        ? { scaleX: 1, scaleY: 1 }
        : actorIdleBreathe(nowMs);
    const baseScale = scaleForContent(
      PLAYER_DISPLAY_HEIGHT,
      PLAYER_CONTENT_HEIGHT_PX,
    );

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
        this.playerSprite.visible = true;
        this.playerFallback.clear();
      } else {
        this.lastPlayerFrameKey = '';
        this.lastPlayerBoundTextureKey = '';
        this.playerUsesCarryTexture = false;
        this.playerSprite.visible = false;
      }
    }

    if (this.playerSprite.visible) {
      this.playerSprite.alpha = 1;
      this.playerSprite.scale.set(
        baseScale * squash.x * breathe.scaleX,
        baseScale * squash.y * breathe.scaleY,
      );
      // Feet stay planted: no vertical idle bob (rhythmic lift read as floating).
      this.playerSprite.position.set(
        Math.round(nav.worldX),
        Math.round(feetY),
      );
      this.playerSprite.zIndex = feetY;
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

  private syncGuests(
    floor: FloorDay,
    guestMotion: GuestMotion | null,
    guestDoor: GridPoint,
  ): void {
    const seen = new Set<string>();
    let waitingIndex = 0;
    const orderAvailable = canEnqueue(floor.tickets, 1);
    const carriedTicket = floor.tickets.find(
      (ticket) =>
        ticket.id === floor.carriedTicketId && ticket.status === 'plated',
    );

    for (const guest of floor.pool) {
      if (guest.stage === 'done') continue;

      if (guest.stage === 'queued') {
        const lineIndex =
          floor.pool.filter(
            (g) => g.stage === 'waiting' || g.stage === 'entering',
          ).length +
          floor.pool
            .filter((g) => g.stage === 'queued')
            .findIndex((g) => g.id === guest.id);
        const world = waitingGuestWorldPosition(guestDoor, Math.max(0, lineIndex));
        seen.add(guest.id);
        const entry = this.ensureGuestEntry(guest.id);
        const wasQueued = entry.stage === 'queued';
        entry.sprite.visible = false;
        entry.lastFrameKey = '';
        entry.actualBoundFrameKey = '';
        entry.requestedFrameKey = '';
        entry.isSeated = false;
        entry.isMoving = false;
        entry.facing = 'down';
        entry.stage = 'queued';
        resetWalkPulse(entry.walkPulse);
        const feetY = world.y + TILE_PX / 2 - 2;
        const targetX = Math.round(world.x);
        const targetY = Math.round(feetY);
        const nowMs = performance.now();

        if (!wasQueued) {
          // Entering the silhouette line: snap (no slide from off-map).
          entry.queueAdvance = null;
          entry.root.position.set(targetX, targetY);
        } else {
          const priorTargetX = entry.queueAdvance?.toX ?? entry.root.position.x;
          const priorTargetY = entry.queueAdvance?.toY ?? entry.root.position.y;
          const targetMoved =
            Math.abs(priorTargetX - targetX) > 0.5 ||
            Math.abs(priorTargetY - targetY) > 0.5;
          if (targetMoved) {
            const fromX = entry.queueAdvance?.active
              ? entry.root.position.x
              : priorTargetX;
            const fromY = entry.queueAdvance?.active
              ? entry.root.position.y
              : priorTargetY;
            entry.queueAdvance = {
              fromX,
              fromY,
              toX: targetX,
              toY: targetY,
              startMs: nowMs,
              active: true,
            };
          }
          if (entry.queueAdvance?.active) {
            const slid = queueLineAdvancePosition(
              { x: entry.queueAdvance.fromX, y: entry.queueAdvance.fromY },
              { x: entry.queueAdvance.toX, y: entry.queueAdvance.toY },
              nowMs - entry.queueAdvance.startMs,
            );
            entry.root.position.set(Math.round(slid.x), Math.round(slid.y));
            if (slid.done) entry.queueAdvance = null;
          } else {
            entry.queueAdvance = null;
            entry.root.position.set(targetX, targetY);
          }
        }

        entry.root.zIndex = entry.root.y - 1;
        entry.cue.clear();
        // Dim silhouette so the door queue reads before admit.
        entry.cue
          .ellipse(0, -6, 10, 4)
          .fill({ color: QUEUED_SILHOUETTE_COLOR, alpha: 0.28 });
        entry.cue
          .circle(0, -18, 9)
          .fill({ color: QUEUED_SILHOUETTE_COLOR, alpha: 0.38 });
        entry.content.mask = null;
        entry.content.y = 0;
        entry.content.renderable = true;
        entry.doorwayCrop = null;
        continue;
      }

      const waitIdx =
        guest.stage === 'waiting' || guest.stage === 'entering'
          ? waitingIndex++
          : undefined;
      const pose = resolveGuestPose(guest, waitIdx, guestMotion);
      if (!pose) continue;
      seen.add(guest.id);
      const entry = this.ensureGuestEntry(guest.id);
      entry.queueAdvance = null;

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
      entry.requestedFrameKey = frameKey;
      entry.isSeated = seated;
      entry.isMoving = pose.isMoving;
      entry.facing = facingName;
      entry.stage = guest.stage;
      if (
        nextBoundFrameKey({
          frameKey,
          lastFrameKey: entry.lastFrameKey,
          hadTexture: entry.sprite.visible,
        })
      ) {
        const candidates = seated
          ? [
              guestSitFrameKey(variant, facingName),
              guestWalkFrameKey(variant, facingName, 0),
              guestWalkFrameKey(variant, 'down', 0),
              'customer',
            ]
          : [
              guestWalkFrameKey(variant, facingName, frame),
              guestWalkFrameKey(variant, facingName, 0),
              guestWalkFrameKey(variant, 'down', 0),
              'customer',
            ];
        let actualBoundFrameKey = '';
        let texture = null;
        for (const candidate of candidates) {
          texture = getCharacterTexture(candidate);
          if (texture) {
            actualBoundFrameKey = candidate;
            break;
          }
        }
        if (texture) {
          entry.lastFrameKey = frameKey;
          entry.actualBoundFrameKey = actualBoundFrameKey;
          entry.sprite.texture = texture;
          entry.sprite.visible = true;
        } else {
          entry.lastFrameKey = '';
          entry.actualBoundFrameKey = '';
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
      const carriedRelation: CarriedDishRelation = !carriedTicket
        ? 'none'
        : carriedTicket.customerId === guest.customer.id
          ? 'matching'
          : 'other';
      this.syncGuestDoorwayCrop(
        entry,
        guest.stage,
        pose,
        guestDoor,
      );
      // Head cues during the doorway crop read as a detached blob left on
      // the threshold once the body has walked clear.
      if (!entry.doorwayCrop) {
        this.drawGuestStageCue(
          entry,
          guestCanvasCueAction(guest.stage, carriedRelation, orderAvailable) ??
            guestStageFloorCue(guest.stage),
        );
      }
      this.applyGuestMotionJuice(entry, guest.stage, pose, performance.now());
    }

    for (const [id, entry] of this.guestSprites) {
      if (seen.has(id)) continue;
      this.actorContainer.removeChild(entry.root);
      this.guestSprites.delete(id);
    }
  }

  private applyGuestMotionJuice(
    entry: GuestSpriteEntry,
    stage: FloorGuest['stage'],
    pose: Pick<GuestPose, 'isMoving' | 'walkFrame'>,
    nowMs: number,
  ): void {
    const contentH = entry.isSeated
      ? GUEST_SIT_CONTENT_HEIGHT_PX
      : GUEST_WALK_CONTENT_HEIGHT_PX;
    const displayH = entry.isSeated
      ? SEATED_GUEST_DISPLAY_HEIGHT
      : GUEST_DISPLAY_HEIGHT;
    const base = scaleForContent(displayH, contentH);

    let sx = 1;
    let sy = 1;

    if (!prefersReducedMotion()) {
      if (pose.isMoving) {
        const squash = tickWalkPulse(
          entry.walkPulse,
          pose.walkFrame,
          true,
          nowMs,
        );
        sx = squash.x;
        sy = squash.y;
      } else {
        resetWalkPulse(entry.walkPulse);
        if (stage === 'eating') {
          // Chew scale only — vertical bob lifts diners off the cushion.
          const pulse = actorEatingPulse(nowMs, entry.phase);
          sx = pulse.scaleX;
          sy = pulse.scaleY;
        } else if (stage === 'seated' || stage === 'ordered' || stage === 'waiting') {
          // Breathe in place. No vertical bob anywhere — rhythmic lift read
          // as floating/bouncing.
          const breathe = actorIdleBreathe(nowMs, entry.phase);
          sx = breathe.scaleX;
          sy = breathe.scaleY;
        }
      }
    } else {
      resetWalkPulse(entry.walkPulse);
    }

    if (entry.sprite.visible) {
      entry.sprite.scale.set(base * sx, base * sy);
    }

    const doorY = entry.doorwayCrop?.visualOffsetY ?? 0;
    entry.content.y = doorY;
  }

  private ensureGuestEntry(guestId: string): GuestSpriteEntry {
    let entry = this.guestSprites.get(guestId);
    if (entry) return entry;
    const root = new Container();
    const content = new Container();
    const sprite = new Sprite();
    sprite.roundPixels = true;
    sprite.anchor.set(0.5, 1);
    sprite.alpha = 1;
    const cue = new Graphics();
    const cropMask = new Graphics();
    cropMask.renderable = false;
    content.addChild(sprite);
    content.addChild(cue);
    root.addChild(content);
    root.addChild(cropMask);
    this.actorContainer.addChild(root);
    entry = {
      root,
      content,
      sprite,
      cue,
      cropMask,
      doorwayCrop: null,
      lastFrameKey: '',
      requestedFrameKey: '',
      actualBoundFrameKey: '',
      isSeated: false,
      isMoving: false,
      facing: 'down',
      stage: null,
      walkPulse: { lastFrame: 0, startMs: 0, active: false },
      phase: hashPhase(guestId),
      queueAdvance: null,
    };
    this.guestSprites.set(guestId, entry);
    return entry;
  }

  private drawGuestStageCue(
    entry: GuestSpriteEntry,
    cue:
      | 'order'
      | 'deliver'
      | 'eating'
      | 'leaving'
      | null,
  ): void {
    if (!cue) return;
    const headY = entry.sprite.visible ? -SEATED_GUEST_DISPLAY_HEIGHT - 4 : -28;
    const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 220);
    if (cue === 'order') {
      // Speech-bubble “!” — order available.
      entry.cue
        .roundRect(-7, headY - 16, 14, 14, 3)
        .fill({ color: CUE_ORDER_COLOR, alpha: 0.55 + pulse * 0.35 });
      entry.cue
        .circle(0, headY - 11, 1.6)
        .fill({ color: 0x3d2c1e, alpha: 0.95 });
      entry.cue
        .rect(-1, headY - 8, 2, 5)
        .fill({ color: 0x3d2c1e, alpha: 0.95 });
      return;
    }
    if (cue === 'deliver') {
      // Plate disc — matching dish ready to serve.
      entry.cue
        .circle(0, headY - 8, 7 + pulse)
        .fill({ color: CUE_DELIVER_COLOR, alpha: 0.7 + pulse * 0.25 });
      entry.cue
        .circle(0, headY - 8, 3.5)
        .fill({ color: 0xfff6e0, alpha: 0.95 });
      return;
    }
    if (cue === 'eating') {
      entry.cue
        .circle(0, headY - 6, 3)
        .fill({ color: CUE_EATING_COLOR, alpha: 0.55 });
      entry.cue
        .circle(-5, headY - 6, 2)
        .fill({ color: CUE_EATING_COLOR, alpha: 0.4 });
      entry.cue
        .circle(5, headY - 6, 2)
        .fill({ color: CUE_EATING_COLOR, alpha: 0.4 });
      return;
    }
    // leaving — empty-plate hint
    entry.cue
      .ellipse(0, headY - 6, 7, 3)
      .stroke({ width: 1.5, color: CUE_LEAVING_COLOR, alpha: 0.7 });
  }

  private clearGuests(): void {
    for (const entry of this.guestSprites.values()) {
      this.actorContainer.removeChild(entry.root);
    }
    this.guestSprites.clear();
  }

  private syncGuestDoorwayCrop(
    entry: GuestSpriteEntry,
    stage: FloorGuest['stage'],
    pose: Pick<GuestPose, 'worldY' | 'isMoving'>,
    guestDoor: GridPoint,
  ): void {
    const fullBounds = this.guestEntryDoorwayWorldBounds(entry);
    const doorwayCrop = guestDoorwayCropGeometry(
      fullBounds,
      stage,
      pose,
      guestDoor,
    );
    entry.doorwayCrop = doorwayCrop;
    entry.cropMask.clear();
    entry.content.y = doorwayCrop?.visualOffsetY ?? 0;
    entry.content.renderable = doorwayCrop?.contentRenderable ?? true;

    if (!doorwayCrop) {
      entry.content.mask = null;
      entry.cropMask.clear();
      entry.cropMask.renderable = false;
      return;
    }

    entry.cropMask.renderable = false;
    entry.content.mask = entry.cropMask;
    const clipped = doorwayCrop.clippedWorldBounds;
    if (!clipped) return;
    entry.cropMask
      .rect(
        clipped.left - entry.root.x,
        clipped.top - entry.root.y,
        clipped.right - clipped.left,
        clipped.bottom - clipped.top,
      )
      .fill({ color: 0xffffff });
  }

  /**
   * Doorway masks use the complete displayed frame rather than alpha-trimmed
   * hit content. Both authored frames and fallback cues therefore end at the
   * actor root, which is the fixed aperture baseline at lane-center arrival.
   */
  private guestEntryDoorwayWorldBounds(
    entry: { root: Container; sprite: Sprite },
  ): GuestWorldBounds {
    if (entry.sprite.visible) {
      const texture = entry.sprite.texture;
      return anchoredSpriteContentWorldBounds({
        rootX: entry.root.x,
        rootY: entry.root.y,
        spriteX: entry.sprite.x,
        spriteY: entry.sprite.y,
        sourceWidth: texture.orig.width,
        sourceHeight: texture.orig.height,
        contentBounds: {
          left: 0,
          top: 0,
          right: texture.orig.width,
          bottom: texture.orig.height,
        },
        anchorX: entry.sprite.anchor.x,
        anchorY: entry.sprite.anchor.y,
        scaleX: entry.sprite.scale.x,
        scaleY: entry.sprite.scale.y,
      });
    }
    return {
      left: entry.root.x - 8,
      top: entry.root.y - 16,
      right: entry.root.x + 8,
      bottom: entry.root.y,
    };
  }

  /** Measure the Graphics geometry that Pixi will actually use as the mask. */
  private guestActualMaskWorldBounds(
    entry: GuestSpriteEntry,
  ): GuestWorldBounds | null {
    const local = entry.cropMask.getLocalBounds();
    if (
      !Number.isFinite(local.minX) ||
      !Number.isFinite(local.minY) ||
      !Number.isFinite(local.maxX) ||
      !Number.isFinite(local.maxY) ||
      local.maxX <= local.minX ||
      local.maxY <= local.minY
    ) {
      return null;
    }

    // Actor roots and their mask child are translation/scale-only by design.
    // Apply those live Pixi transforms instead of repeating intended crop
    // geometry, while intentionally stopping before the camera/world stage.
    const maskLeft = entry.cropMask.x +
      (local.minX - entry.cropMask.pivot.x) * entry.cropMask.scale.x;
    const maskRight = entry.cropMask.x +
      (local.maxX - entry.cropMask.pivot.x) * entry.cropMask.scale.x;
    const maskTop = entry.cropMask.y +
      (local.minY - entry.cropMask.pivot.y) * entry.cropMask.scale.y;
    const maskBottom = entry.cropMask.y +
      (local.maxY - entry.cropMask.pivot.y) * entry.cropMask.scale.y;
    const x1 = entry.root.x +
      (maskLeft - entry.root.pivot.x) * entry.root.scale.x;
    const x2 = entry.root.x +
      (maskRight - entry.root.pivot.x) * entry.root.scale.x;
    const y1 = entry.root.y +
      (maskTop - entry.root.pivot.y) * entry.root.scale.y;
    const y2 = entry.root.y +
      (maskBottom - entry.root.pivot.y) * entry.root.scale.y;
    return {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      right: Math.max(x1, x2),
      bottom: Math.max(y1, y2),
    };
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
