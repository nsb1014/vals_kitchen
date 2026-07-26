import { Container, Graphics, Sprite } from 'pixi.js';
import { getTileTexture } from '../../assets/loader.ts';
import { createStarterMap, isPerimeterWallCell } from '../../domain/floor/starter-map.ts';
import { gridToWorld, TILE_PX, type CameraState } from '../coordinates.ts';

const FLOOR_COLOR = 0x3d3d5c;
const GRID_LINE_COLOR = 0x2a2a40;

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export class GridLayer {
  readonly view = new Container();
  private floorContainer = new Container();
  private wallContainer = new Container();
  private gridLines = new Graphics();
  private lastKey = '';

  constructor() {
    this.view.addChild(this.floorContainer);
    this.view.addChild(this.wallContainer);
    this.view.addChild(this.gridLines);
  }

  sync(gridW: number, gridH: number, _camera: CameraState): void {
    const floorA = getTileTexture('floor_a');
    const floorB = getTileTexture('floor_b');
    const kitchenA = getTileTexture('floor_kitchen_a') ?? floorA;
    const kitchenB = getTileTexture('floor_kitchen_b') ?? floorB;
    const wallTex = getTileTexture('wall');
    const doorTex = getTileTexture('door');
    const key = `${gridW}x${gridH}:${Boolean(floorA)}:${Boolean(kitchenA)}:${Boolean(wallTex)}`;

    if (key !== this.lastKey) {
      this.lastKey = key;
      this.floorContainer.removeChildren();
      this.wallContainer.removeChildren();

      const starter = createStarterMap();
      const kitchen = new Set(
        (gridW === starter.gridSize.w && gridH === starter.gridSize.h
          ? starter.zones.kitchen
          : []
        ).map((c) => cellKey(c.x, c.y)),
      );
      const door =
        gridW === starter.gridSize.w && gridH === starter.gridSize.h
          ? starter.zones.door
          : { x: Math.floor(gridW / 2), y: gridH - 1 };

      for (let gy = 0; gy < gridH; gy += 1) {
        for (let gx = 0; gx < gridW; gx += 1) {
          const { x, y } = gridToWorld(gx, gy);
          const useA = (gx + gy) % 2 === 0;
          const inKitchen = kitchen.has(cellKey(gx, gy));
          const texture = inKitchen
            ? useA
              ? kitchenA
              : kitchenB
            : useA
              ? floorA
              : floorB;

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

      const placeWall = (gx: number, gy: number, isDoor: boolean) => {
        const { x, y } = gridToWorld(gx, gy);
        const texture = isDoor ? doorTex : wallTex;
        if (texture) {
          const tile = new Sprite(texture);
          tile.roundPixels = true;
          tile.width = TILE_PX;
          tile.height = TILE_PX;
          tile.position.set(x, y);
          this.wallContainer.addChild(tile);
          return;
        }
        const block = new Graphics();
        block.rect(x, y, TILE_PX, TILE_PX).fill(isDoor ? 0x5a3a22 : 0x5c4a3a);
        this.wallContainer.addChild(block);
      };

      for (let gy = 0; gy < gridH; gy += 1) {
        for (let gx = 0; gx < gridW; gx += 1) {
          if (!isPerimeterWallCell(gx, gy, gridW, gridH)) continue;
          const isDoor = gx === door.x && gy === door.y;
          placeWall(gx, gy, isDoor);
        }
      }
    }

    this.gridLines.clear();
    this.gridLines.setStrokeStyle({ width: 1, color: GRID_LINE_COLOR, alpha: 0.25 });
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
