import { Container, Graphics, Sprite } from 'pixi.js';
import { getTileTexture } from '../../assets/loader.ts';
import { gridToWorld, TILE_PX, type CameraState } from '../coordinates.ts';

const FLOOR_COLOR = 0x3d3d5c;
const GRID_LINE_COLOR = 0x2a2a40;

export class GridLayer {
  readonly view = new Container();
  private floorContainer = new Container();
  private gridLines = new Graphics();
  private lastKey = '';

  constructor() {
    this.view.addChild(this.floorContainer);
    this.view.addChild(this.gridLines);
  }

  sync(gridW: number, gridH: number, _camera: CameraState): void {
    const floorA = getTileTexture('floor_a');
    const floorB = getTileTexture('floor_b');
    const key = `${gridW}x${gridH}:${Boolean(floorA)}`;

    if (key !== this.lastKey) {
      this.lastKey = key;
      this.floorContainer.removeChildren();

      for (let gy = 0; gy < gridH; gy += 1) {
        for (let gx = 0; gx < gridW; gx += 1) {
          const { x, y } = gridToWorld(gx, gy);
          const useA = (gx + gy) % 2 === 0;
          const texture = useA ? floorA : floorB;

          if (texture) {
            const tile = new Sprite(texture);
            tile.roundPixels = true;
            tile.width = TILE_PX;
            tile.height = TILE_PX;
            tile.position.set(x, y);
            this.floorContainer.addChild(tile);
          } else {
            const shade = useA ? FLOOR_COLOR : FLOOR_COLOR - 0x050508;
            const block = new Graphics();
            block.rect(x, y, TILE_PX, TILE_PX).fill(shade);
            this.floorContainer.addChild(block);
          }
        }
      }
    }

    this.gridLines.clear();
    this.gridLines.setStrokeStyle({ width: 1, color: GRID_LINE_COLOR, alpha: 0.6 });
    for (let gx = 0; gx <= gridW; gx += 1) {
      const x = gx * TILE_PX;
      this.gridLines.moveTo(x, 0).lineTo(x, gridH * TILE_PX);
    }
    for (let gy = 0; gy <= gridH; gy += 1) {
      const y = gy * TILE_PX;
      this.gridLines.moveTo(0, y).lineTo(gridW * TILE_PX, y);
    }
    this.gridLines.stroke();
  }
}
