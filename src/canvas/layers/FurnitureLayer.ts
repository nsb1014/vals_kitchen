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
import { seatSitWorldPosition } from '../world/seat-sit.ts';

const MIN_HIT_PX = 44;
const HIT_PADDING = Math.max(0, Math.ceil((MIN_HIT_PX - TILE_PX) / 2));

interface FurnitureSprite {
  root: Container;
  body: Graphics;
  sprite: Sprite | null;
  placementId: string;
}

export class FurnitureLayer {
  readonly view: Container;
  private sprites = new Map<string, FurnitureSprite>();
  private chairSprites = new Map<string, FurnitureSprite>();
  private pool: FurnitureSprite[] = [];

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

  private acquireSprite(): FurnitureSprite {
    const pooled = this.pool.pop();
    if (pooled) {
      pooled.placementId = '';
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
    return { root, body, sprite, placementId: '' };
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
    this.pool.push(sprite);
  }

  private drawChair(sprite: FurnitureSprite, seat: SeatSlot): void {
    sprite.placementId = `chair:${seat.tablePlacementId}:${seat.slotIndex}`;
    // Sit anchor uses nav-center space; guest feet = sit.y + TILE_PX / 2 - 2.
    const sit = seatSitWorldPosition(seat);
    const feetY = sit.y + TILE_PX / 2 - 2;
    sprite.root.position.set(sit.x - TILE_PX / 2, feetY - TILE_PX);
    // Chair behind guest; camera-biased sit feet already clear the tabletop.
    sprite.root.zIndex = chairDepthY(feetY);
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
      // chair_side faces right (west seat → table); flip for east seats facing left.
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
    const { x, y } = gridToWorld(placement.x, placement.y);
    sprite.root.position.set(x, y);
    // Furniture joins the same depth-sorted container as actors. Tables sit
    // between chairs and seated guests so diners remain visible.
    sprite.root.zIndex = furnitureDepthY(placement.y);

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
}
