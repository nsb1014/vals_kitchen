import { Graphics } from 'pixi.js';
import { gridToWorld, TILE_PX } from '../coordinates.ts';

const VALID_TINT = 0x44aa66;
const INVALID_TINT = 0xcc4444;

export class PreviewLayer {
  readonly view = new Graphics();
  private visible = false;

  show(gx: number, gy: number, _itemKey: string, valid: boolean): void {
    this.visible = true;
    this.view.visible = true;
    const { x, y } = gridToWorld(gx, gy);
    const fill = valid ? VALID_TINT : INVALID_TINT;
    this.view.clear();
    this.view.rect(x + 1, y + 1, TILE_PX - 2, TILE_PX - 2).fill({ color: fill, alpha: 0.45 });
    this.view.rect(x + 1, y + 1, TILE_PX - 2, TILE_PX - 2).stroke({
      width: 2,
      color: fill,
      alpha: 0.9,
    });
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.view.visible = false;
    this.view.clear();
  }
}
