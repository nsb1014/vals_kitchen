import { Graphics } from 'pixi.js';
import { gridToWorld, TILE_PX } from '../coordinates.ts';
import type { InteractHintStrength } from '../world/floor-feel-hints.ts';

const HINT_FILL = 0xc4a35a;
const PREVIEW_FILL = 0xe8d48a;

export type InteractHintCell = {
  x: number;
  y: number;
  strength?: InteractHintStrength;
};

export class InteractHintLayer {
  readonly view = new Graphics();
  private cells: InteractHintCell[] = [];

  sync(hints: InteractHintCell[]): void {
    this.cells = hints.map((hint) => ({
      x: hint.x,
      y: hint.y,
      strength: hint.strength ?? 'near',
    }));
    this.view.clear();
    if (hints.length === 0) {
      this.view.visible = false;
      return;
    }

    this.view.visible = true;
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 180);
    for (const hint of this.cells) {
      const strength = hint.strength ?? 'near';
      const { x, y } = gridToWorld(hint.x, hint.y);
      const fill =
        strength === 'preview' ? PREVIEW_FILL : HINT_FILL;
      const alphaScale =
        strength === 'far' ? 0.45 : strength === 'preview' ? 0.85 : 1;
      const inset =
        strength === 'far' ? 3 + pulse * 0.5 : 1 + pulse;
      const fillAlpha = (0.24 + pulse * 0.18) * alphaScale;
      const strokeAlpha = (0.72 + pulse * 0.25) * alphaScale;
      this.view
        .rect(x + inset, y + inset, TILE_PX - inset * 2, TILE_PX - inset * 2)
        .fill({ color: fill, alpha: fillAlpha });
      this.view
        .rect(x + inset, y + inset, TILE_PX - inset * 2, TILE_PX - inset * 2)
        .stroke({
          width: strength === 'far' ? 1.5 + pulse * 0.5 : 2 + pulse,
          color: fill,
          alpha: strokeAlpha,
        });
    }
  }

  clear(): void {
    this.cells = [];
    this.view.clear();
    this.view.visible = false;
  }

  /** E2E/debug: grid cells only (strength stripped for bridge compatibility). */
  getCells(): { x: number; y: number }[] {
    return this.cells.map((cell) => ({ x: cell.x, y: cell.y }));
  }

  getHintCells(): InteractHintCell[] {
    return this.cells.map((cell) => ({ ...cell }));
  }
}
