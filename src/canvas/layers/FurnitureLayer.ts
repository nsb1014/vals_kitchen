import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Placement } from '../../domain/state/game-state.ts';
import type { SeatSlot } from '../../domain/floor/types.ts';
import { getFurnitureTexture } from '../../assets/loader.ts';
import { fallbackTintForItemKey, spriteNameForItemKey } from '../../assets/furniture-sprites.ts';
import { furnitureDrawOffset, furnitureDrawSize } from '../furniture-fit.ts';
import { gridToWorld, TILE_PX } from '../coordinates.ts';

const MIN_HIT_PX = 44;
const HIT_PADDING = Math.max(0, Math.ceil((MIN_HIT_PX - TILE_PX) / 2));

interface FurnitureSprite {
  root: Container;
  body: Graphics;
  sprite: Sprite | null;
  placementId: string;
}

export class FurnitureLayer {
  readonly view = new Container();
  private sprites = new Map<string, FurnitureSprite>();
  private chairSprites = new Map<string, FurnitureSprite>();
  private pool: FurnitureSprite[] = [];

  sync(placements: Placement[], editMode: boolean, seats: SeatSlot[] = []): void {
    const seen = new Set<string>();

    for (const placement of placements) {
      seen.add(placement.id);
      let sprite = this.sprites.get(placement.id);
      if (!sprite) {
        sprite = this.acquireSprite();
        this.sprites.set(placement.id, sprite);
        this.view.addChild(sprite.root);
      }
      this.drawSprite(sprite, placement, editMode);
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
    sprite.root.removeAllListeners();
    sprite.root.cursor = 'grab';
    sprite.placementId = '';
    this.pool.push(sprite);
  }

  private drawChair(sprite: FurnitureSprite, seat: SeatSlot): void {
    sprite.placementId = `chair:${seat.tablePlacementId}:${seat.slotIndex}`;
    const { x, y } = gridToWorld(seat.x, seat.y);
    sprite.root.position.set(x, y);
    sprite.body.clear();
    const texture = getFurnitureTexture('chair');
    if (texture) {
      this.applyFurnitureTexture(sprite.sprite!, texture);
    } else {
      sprite.sprite!.visible = false;
      sprite.body.rect(4, 4, TILE_PX - 8, TILE_PX - 8).fill(0x7a5230);
    }
    sprite.root.eventMode = 'none';
    sprite.root.cursor = 'default';
  }

  private drawSprite(sprite: FurnitureSprite, placement: Placement, editMode: boolean): void {
    sprite.placementId = placement.id;
    const { x, y } = gridToWorld(placement.x, placement.y);
    sprite.root.position.set(x, y);

    const spriteName = spriteNameForItemKey(placement.itemKey);
    const texture = getFurnitureTexture(spriteName);
    sprite.body.clear();

    if (texture) {
      this.applyFurnitureTexture(sprite.sprite!, texture);
    } else {
      sprite.sprite!.visible = false;
      const color = fallbackTintForItemKey(placement.itemKey);
      sprite.body.rect(2, 2, TILE_PX - 4, TILE_PX - 4).fill(color);
      sprite.body.rect(4, 4, TILE_PX - 8, TILE_PX - 8).fill({ color, alpha: 0.75 });
      if (placement.itemKey.startsWith('table')) {
        sprite.body.circle(TILE_PX / 2, TILE_PX / 2, 4).fill(0xf5deb3);
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

  private applyFurnitureTexture(sprite: Sprite, texture: Texture): void {
    const { w, h } = furnitureDrawSize(texture);
    const { x, y } = furnitureDrawOffset(w, h);
    sprite.texture = texture;
    sprite.visible = true;
    sprite.width = w;
    sprite.height = h;
    sprite.position.set(x, y);
  }
}
