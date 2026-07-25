import { Container, Graphics, Sprite } from 'pixi.js';
import type { Placement } from '../../domain/state/game-state.ts';
import { getCharacterTexture } from '../../assets/loader.ts';
import { gridToWorld, TILE_PX } from '../coordinates.ts';

const CUSTOMER_DISPLAY_H = 32;

export class CustomerLayer {
  readonly view = new Container();
  private body = new Graphics();
  private sprite = new Sprite();
  private visible = false;

  constructor() {
    this.sprite.visible = false;
    this.sprite.roundPixels = true;
    this.view.addChild(this.sprite);
    this.view.addChild(this.body);
    this.view.visible = false;
  }

  sync(queueIndex: number, placements: Placement[], activeDayOpen: boolean): void {
    this.visible = activeDayOpen && queueIndex >= 0;
    this.view.visible = this.visible;
    if (!this.visible) {
      this.body.clear();
      this.sprite.visible = false;
      return;
    }

    const table = placements.find((item) => item.itemKey.startsWith('table'));
    const gx = table ? table.x + 1 : 1;
    const gy = table ? table.y : 1;
    const { x, y } = gridToWorld(gx, gy);
    this.view.position.set(x + TILE_PX / 2 - 10, y - TILE_PX);

    const texture = getCharacterTexture('customer');
    this.body.clear();

    if (texture) {
      this.sprite.texture = texture;
      this.sprite.visible = true;
      const scale = CUSTOMER_DISPLAY_H / texture.height;
      this.sprite.scale.set(scale);
      this.sprite.position.set(0, 0);
    } else {
      this.sprite.visible = false;
      this.body.circle(10, 18, 10).fill(0xffc857);
      this.body.rect(4, 28, 12, 14).fill(0x4a90d9);
      this.body.rect(0, 38, 20, 6).fill(0x333344);
    }
  }

  getAnchorWorldPosition(): { x: number; y: number } | null {
    if (!this.visible) return null;
    return {
      x: this.view.position.x + 10,
      y: this.view.position.y,
    };
  }
}
