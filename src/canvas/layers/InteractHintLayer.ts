import { Graphics } from 'pixi.js';
import { gridToWorld, TILE_PX } from '../coordinates.ts';

const HINT_FILL = 0xc4a35a;

export class InteractHintLayer {
  readonly view = new Graphics();

  sync(hints: { x: number; y: number }[]): void {
    this.view.clear();
    if (hints.length === 0) {
      this.view.visible = false;
      return;
    }

    this.view.visible = true;
    for (const { x: gx, y: gy } of hints) {
      const { x, y } = gridToWorld(gx, gy);
      this.view.rect(x + 1, y + 1, TILE_PX - 2, TILE_PX - 2).fill({ color: HINT_FILL, alpha: 0.28 });
      this.view.rect(x + 1, y + 1, TILE_PX - 2, TILE_PX - 2).stroke({
        width: 2,
        color: HINT_FILL,
        alpha: 0.7,
      });
    }
  }

  clear(): void {
    this.view.clear();
    this.view.visible = false;
  }
}
