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
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 180);
    for (const { x: gx, y: gy } of hints) {
      const { x, y } = gridToWorld(gx, gy);
      const inset = 1 + pulse;
      this.view
        .rect(x + inset, y + inset, TILE_PX - inset * 2, TILE_PX - inset * 2)
        .fill({ color: HINT_FILL, alpha: 0.24 + pulse * 0.18 });
      this.view.rect(x + inset, y + inset, TILE_PX - inset * 2, TILE_PX - inset * 2).stroke({
        width: 2 + pulse,
        color: HINT_FILL,
        alpha: 0.72 + pulse * 0.25,
      });
    }
  }

  clear(): void {
    this.view.clear();
    this.view.visible = false;
  }
}
