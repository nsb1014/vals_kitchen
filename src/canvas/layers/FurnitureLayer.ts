import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Placement } from '../../domain/state/game-state.ts';
import type { SeatSlot, TableSurfaceState } from '../../domain/floor/types.ts';
import { getFurnitureTexture } from '../../assets/loader.ts';
import { fallbackTintForItemKey, spriteNameForItemKey } from '../../assets/furniture-sprites.ts';
import {
  chairDepthY,
  chairDrawFit,
  furnitureDepthY,
  furnitureDrawOffset,
  furnitureDrawSize,
} from '../furniture-fit.ts';
import { gridToWorld, TILE_PX } from '../coordinates.ts';
import { seatChairWorldPosition, seatSitWorldPosition } from '../world/seat-sit.ts';
import {
  renderedAlphaMaskContainsWorldPoint,
  renderedNodePaintsAbove,
  renderedSpriteBoundsContainWorldPoint,
  type GuestWorldBounds,
  type RenderedNodeOrder,
} from '../world/guest-hit.ts';

const MIN_HIT_PX = 44;
const HIT_PADDING = Math.max(0, Math.ceil((MIN_HIT_PX - TILE_PX) / 2));

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface FurnitureSprite {
  root: Container;
  body: Graphics;
  sprite: Sprite | null;
  placementId: string;
  itemKey: string;
  tablePlacementId: string;
  slotIndex: number;
}

interface TextureAlphaMask {
  width: number;
  height: number;
  alpha: Uint8Array;
}

export interface OpaqueTableOcclusion {
  placementId: string;
  zIndex: number;
  paintOrder: number;
}

export interface SeatingDepthDebug {
  tables: Array<{
    placementId: string;
    itemKey: string;
    zIndex: number;
    x: number;
    y: number;
  }>;
  chairs: Array<{
    tablePlacementId: string;
    slotIndex: number;
    zIndex: number;
    x: number;
    y: number;
  }>;
}

export class FurnitureLayer {
  readonly view: Container;
  private sprites = new Map<string, FurnitureSprite>();
  private chairSprites = new Map<string, FurnitureSprite>();
  private pool: FurnitureSprite[] = [];
  private readonly textureAlphaMasks = new WeakMap<Texture, TextureAlphaMask | null>();

  constructor(view: Container = new Container()) {
    this.view = view;
    this.view.sortableChildren = true;
  }

  sync(
    placements: Placement[],
    editMode: boolean,
    seats: SeatSlot[] = [],
    tableStates: ReadonlyMap<string, TableSurfaceState> | null = null,
  ): void {
    const seen = new Set<string>();

    for (const placement of placements) {
      seen.add(placement.id);
      let sprite = this.sprites.get(placement.id);
      if (!sprite) {
        sprite = this.acquireSprite();
        this.sprites.set(placement.id, sprite);
        this.view.addChild(sprite.root);
      }
      const tableState = placement.itemKey.startsWith('table')
        ? (tableStates?.get(placement.id) ?? null)
        : null;
      this.drawSprite(sprite, placement, editMode, tableState);
    }

    for (const [id, sprite] of this.sprites) {
      if (seen.has(id)) continue;
      this.view.removeChild(sprite.root);
      this.sprites.delete(id);
      this.releaseSprite(sprite);
    }

    const chairSeen = new Set<string>();
    if (!editMode) {
      for (const seat of seats) {
        const id = `chair:${seat.tablePlacementId}:${seat.slotIndex}`;
        chairSeen.add(id);
        let sprite = this.chairSprites.get(id);
        if (!sprite) {
          sprite = this.acquireSprite();
          this.chairSprites.set(id, sprite);
          this.view.addChild(sprite.root);
        }
        this.drawChair(sprite, seat);
      }
    }
    for (const [id, sprite] of this.chairSprites) {
      if (chairSeen.has(id)) continue;
      this.view.removeChild(sprite.root);
      this.chairSprites.delete(id);
      this.releaseSprite(sprite);
    }
  }

  findPlacementAtWorld(wx: number, wy: number): string | null {
    for (const [id, sprite] of this.sprites) {
      const pos = sprite.root.position;
      const minX = pos.x - HIT_PADDING;
      const minY = pos.y - HIT_PADDING;
      const maxX = pos.x + TILE_PX + HIT_PADDING;
      const maxY = pos.y + TILE_PX + HIT_PADDING;
      if (wx >= minX && wx <= maxX && wy >= minY && wy <= maxY) {
        return id;
      }
    }
    return null;
  }

  getSpriteRoot(placementId: string): Container | undefined {
    return this.sprites.get(placementId)?.root;
  }

  getSeatingDepthDebug(): SeatingDepthDebug {
    const tables = [...this.sprites.values()]
      .filter((entry) => entry.itemKey.startsWith('table'))
      .map((entry) => ({
        placementId: entry.placementId,
        itemKey: entry.itemKey,
        zIndex: entry.root.zIndex,
        x: entry.root.x,
        y: entry.root.y,
      }))
      .sort((a, b) => compareIds(a.placementId, b.placementId));
    const chairs = [...this.chairSprites.values()]
      .map((entry) => ({
        tablePlacementId: entry.tablePlacementId,
        slotIndex: entry.slotIndex,
        zIndex: entry.root.zIndex,
        x: entry.root.x,
        y: entry.root.y,
      }))
      .sort(
        (a, b) =>
          compareIds(a.tablePlacementId, b.tablePlacementId) || a.slotIndex - b.slotIndex,
      );
    return { tables, chairs };
  }

  getSeatingPaintDebug(): Readonly<{
    tables: Array<{ placementId: string; paintOrder: number; inDepthParent: boolean }>;
    chairs: Array<{
      tablePlacementId: string;
      slotIndex: number;
      paintOrder: number;
      inDepthParent: boolean;
    }>;
  }> {
    this.view.sortChildren();
    return {
      tables: [...this.sprites.values()]
        .filter((entry) => entry.itemKey.startsWith('table'))
        .map((entry) => ({
          placementId: entry.placementId,
          paintOrder: this.view.getChildIndex(entry.root),
          inDepthParent: entry.root.parent === this.view,
        })),
      chairs: [...this.chairSprites.values()].map((entry) => ({
        tablePlacementId: entry.tablePlacementId,
        slotIndex: entry.slotIndex,
        paintOrder: this.view.getChildIndex(entry.root),
        inDepthParent: entry.root.parent === this.view,
      })),
    };
  }

  /** Return the highest actually painted table pixel above a candidate actor. */
  getOpaqueTableOccluderAtWorld(
    wx: number,
    wy: number,
    actorOrder: RenderedNodeOrder,
  ): OpaqueTableOcclusion | null {
    this.view.sortChildren();
    let topmost: OpaqueTableOcclusion | null = null;
    for (const entry of this.sprites.values()) {
      if (!entry.itemKey.startsWith('table')) continue;
      const candidate = {
        placementId: entry.placementId,
        zIndex: entry.root.zIndex,
        paintOrder: this.view.getChildIndex(entry.root),
      };
      if (
        !renderedNodePaintsAbove(
          { sortY: candidate.zIndex, paintOrder: candidate.paintOrder },
          actorOrder,
        ) ||
        !this.tablePaintsAtWorldPoint(entry, wx, wy)
      ) {
        continue;
      }
      if (
        !topmost ||
        renderedNodePaintsAbove(
          { sortY: candidate.zIndex, paintOrder: candidate.paintOrder },
          { sortY: topmost.zIndex, paintOrder: topmost.paintOrder },
        )
      ) {
        topmost = candidate;
      }
    }
    return topmost;
  }

  /** Debug-only probe: find a real opaque overlap across the displayed table silhouette. */
  findOpaqueTableOcclusionPoint(
    bounds: GuestWorldBounds,
    actorOrder: RenderedNodeOrder,
  ): ({ x: number; y: number; usesTableOverhang: boolean } & OpaqueTableOcclusion) | null {
    for (const entry of this.sprites.values()) {
      if (!entry.itemKey.startsWith('table')) continue;
      const sprite = entry.sprite;
      const paintedLeft = sprite?.visible
        ? entry.root.x + sprite.x
        : entry.root.x + 2;
      const paintedTop = sprite?.visible
        ? entry.root.y + sprite.y
        : entry.root.y + 2;
      const paintedRight = sprite?.visible
        ? paintedLeft + sprite.width
        : entry.root.x + TILE_PX - 2;
      const paintedBottom = sprite?.visible
        ? paintedTop + sprite.height
        : entry.root.y + TILE_PX - 2;
      const left = Math.ceil(Math.max(bounds.left, paintedLeft));
      const top = Math.ceil(Math.max(bounds.top, paintedTop));
      const right = Math.floor(Math.min(bounds.right, paintedRight));
      const bottom = Math.floor(Math.min(bounds.bottom, paintedBottom));
      // Prefer a painted overhang point because it proves the seat-cell fallback
      // follows render ownership too; fall back to any opaque overlap if needed.
      for (const overhangOnly of [true, false]) {
        for (let y = top; y <= bottom; y += 1) {
          for (let x = left; x <= right; x += 1) {
            const usesTableOverhang =
              x < entry.root.x ||
              x >= entry.root.x + TILE_PX ||
              y < entry.root.y ||
              y >= entry.root.y + TILE_PX;
            if (overhangOnly && !usesTableOverhang) continue;
            const occluder = this.getOpaqueTableOccluderAtWorld(x, y, actorOrder);
            if (occluder?.placementId === entry.placementId) {
              return { ...occluder, x, y, usesTableOverhang };
            }
          }
        }
      }
    }
    return null;
  }

  private acquireSprite(): FurnitureSprite {
    const pooled = this.pool.pop();
    if (pooled) {
      pooled.placementId = '';
      pooled.itemKey = '';
      pooled.tablePlacementId = '';
      pooled.slotIndex = -1;
      return pooled;
    }
    const root = new Container();
    root.eventMode = 'static';
    root.cursor = 'grab';
    const body = new Graphics();
    const sprite = new Sprite();
    sprite.visible = false;
    sprite.roundPixels = true;
    root.addChild(sprite);
    root.addChild(body);
    return {
      root,
      body,
      sprite,
      placementId: '',
      itemKey: '',
      tablePlacementId: '',
      slotIndex: -1,
    };
  }

  private releaseSprite(sprite: FurnitureSprite): void {
    sprite.body.clear();
    sprite.sprite!.visible = false;
    sprite.sprite!.texture = Texture.EMPTY;
    sprite.sprite!.anchor.set(0, 0);
    sprite.sprite!.scale.set(1, 1);
    sprite.root.removeAllListeners();
    sprite.root.cursor = 'grab';
    sprite.placementId = '';
    sprite.itemKey = '';
    sprite.tablePlacementId = '';
    sprite.slotIndex = -1;
    this.pool.push(sprite);
  }

  private drawChair(sprite: FurnitureSprite, seat: SeatSlot): void {
    sprite.placementId = `chair:${seat.tablePlacementId}:${seat.slotIndex}`;
    sprite.itemKey = 'chair';
    sprite.tablePlacementId = seat.tablePlacementId;
    sprite.slotIndex = seat.slotIndex;
    // Backless stool and authored seated pose share the seat-cell floor baseline.
    const chair = seatChairWorldPosition(seat);
    const sit = seatSitWorldPosition(seat);
    const chairFeetY = chair.y + TILE_PX / 2 - 2;
    const guestFeetY = sit.y + TILE_PX / 2 - 2;
    sprite.root.position.set(chair.x - TILE_PX / 2, chairFeetY - TILE_PX);
    // Always sort the stool behind the diner so legs remain readable.
    sprite.root.zIndex = chairDepthY(guestFeetY);
    sprite.body.clear();
    const sideFacing = seat.facing === 90 || seat.facing === 270;
    const frontBackTexture =
      seat.facing === 180
        ? getFurnitureTexture('chair_back')
        : getFurnitureTexture('chair');
    const texture =
      (sideFacing ? getFurnitureTexture('chair_side') : frontBackTexture) ??
      getFurnitureTexture('chair');
    if (texture) {
      const fit = chairDrawFit(texture);
      const spr = sprite.sprite!;
      spr.texture = texture;
      spr.visible = true;
      spr.anchor.set(0.5, 1);
      spr.scale.set(1, 1);
      spr.width = fit.w;
      spr.height = fit.h;
      // Side stool art is nearly symmetric; mirror it to preserve lighting direction.
      if (seat.facing === 270) {
        spr.scale.x = -Math.abs(spr.scale.x);
      }
      spr.position.set(TILE_PX / 2, TILE_PX);
    } else {
      sprite.sprite!.visible = false;
      sprite.sprite!.anchor.set(0, 0);
      sprite.sprite!.scale.set(1, 1);
      sprite.body.rect(4, 4, TILE_PX - 8, TILE_PX - 8).fill(0x7a5230);
    }
    sprite.root.eventMode = 'none';
    sprite.root.cursor = 'default';
  }

  private drawSprite(
    sprite: FurnitureSprite,
    placement: Placement,
    editMode: boolean,
    tableState: TableSurfaceState | null,
  ): void {
    sprite.placementId = placement.id;
    sprite.itemKey = placement.itemKey;
    sprite.tablePlacementId = '';
    sprite.slotIndex = -1;
    const { x, y } = gridToWorld(placement.x, placement.y);
    sprite.root.position.set(x, y);
    // Tables and tall stations use south-edge sorting; rugs stay on the floor plane.
    sprite.root.zIndex = furnitureDepthY(placement.y, placement.itemKey);

    const spriteName = spriteNameForItemKey(placement.itemKey, tableState);
    const texture = getFurnitureTexture(spriteName);
    sprite.body.clear();

    if (texture) {
      this.applyFurnitureTexture(sprite.sprite!, texture, placement.itemKey);
    } else {
      sprite.sprite!.visible = false;
      const color = fallbackTintForItemKey(placement.itemKey);
      sprite.body.rect(2, 2, TILE_PX - 4, TILE_PX - 4).fill(color);
      sprite.body.rect(4, 4, TILE_PX - 8, TILE_PX - 8).fill({ color, alpha: 0.75 });
      if (placement.itemKey.startsWith('table')) {
        if (tableState === 'ready' || tableState === 'occupied') {
          sprite.body.circle(TILE_PX / 2 - 6, TILE_PX / 2, 3).fill(0xf5deb3);
          sprite.body.circle(TILE_PX / 2 + 6, TILE_PX / 2, 3).fill(0xf5deb3);
        } else if (tableState === 'dirty') {
          sprite.body.circle(TILE_PX / 2 - 5, TILE_PX / 2 - 2, 3).fill(0xc4b59a);
          sprite.body.circle(TILE_PX / 2 + 5, TILE_PX / 2 + 1, 2).fill(0x8b4513);
          sprite.body.circle(TILE_PX / 2, TILE_PX / 2 + 4, 1).fill(0x6b3a2a);
        }
      }
    }

    sprite.root.eventMode = editMode ? 'static' : 'none';
    sprite.root.cursor = editMode ? 'grab' : 'default';
    sprite.root.hitArea = new Rectangle(
      -HIT_PADDING,
      -HIT_PADDING,
      TILE_PX + HIT_PADDING * 2,
      TILE_PX + HIT_PADDING * 2,
    );
  }

  private applyFurnitureTexture(sprite: Sprite, texture: Texture, itemKey: string): void {
    const { w, h } = furnitureDrawSize(texture, itemKey);
    const { x, y } = furnitureDrawOffset(w, h);
    sprite.texture = texture;
    sprite.visible = true;
    sprite.anchor.set(0, 0);
    sprite.scale.set(1, 1);
    sprite.width = w;
    sprite.height = h;
    sprite.position.set(x, y);
  }

  private tablePaintsAtWorldPoint(
    entry: FurnitureSprite,
    wx: number,
    wy: number,
  ): boolean {
    const sprite = entry.sprite;
    if (sprite?.visible && sprite.texture !== Texture.EMPTY) {
      const mask = this.alphaMaskForTexture(sprite.texture);
      const point = { x: wx, y: wy };
      const geometry = {
        rootX: entry.root.x,
        rootY: entry.root.y,
        spriteX: sprite.x,
        spriteY: sprite.y,
        displayWidth: sprite.width,
        displayHeight: sprite.height,
      };
      // Canvas readback can fail independently of the texture that Pixi has
      // already painted. Keep that visible sprite conservative instead of
      // allowing input to pass through to an actor underneath it.
      if (!mask) return renderedSpriteBoundsContainWorldPoint(point, geometry);
      return renderedAlphaMaskContainsWorldPoint(point, {
        ...geometry,
        maskWidth: mask.width,
        maskHeight: mask.height,
        alpha: mask.alpha,
      });
    }

    // The no-atlas fallback paints two nested rectangles whose union is this inset box.
    const localX = wx - entry.root.x;
    const localY = wy - entry.root.y;
    return (
      localX >= 2 &&
      localX < TILE_PX - 2 &&
      localY >= 2 &&
      localY < TILE_PX - 2
    );
  }

  private alphaMaskForTexture(texture: Texture): TextureAlphaMask | null {
    if (this.textureAlphaMasks.has(texture)) {
      return this.textureAlphaMasks.get(texture) ?? null;
    }
    if (typeof document === 'undefined' || texture.rotate !== 0) {
      this.textureAlphaMasks.set(texture, null);
      return null;
    }
    const width = Math.round(texture.frame.width);
    const height = Math.round(texture.frame.height);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('2D context unavailable');
      context.drawImage(
        texture.source.resource as HTMLImageElement,
        texture.frame.x,
        texture.frame.y,
        texture.frame.width,
        texture.frame.height,
        0,
        0,
        width,
        height,
      );
      const rgba = context.getImageData(0, 0, width, height).data;
      const alpha = new Uint8Array(width * height);
      for (let pixel = 0; pixel < alpha.length; pixel += 1) {
        alpha[pixel] = rgba[pixel * 4 + 3] ?? 0;
      }
      const mask = { width, height, alpha };
      this.textureAlphaMasks.set(texture, mask);
      return mask;
    } catch {
      this.textureAlphaMasks.set(texture, null);
      return null;
    }
  }
}
