import { Container, Graphics, Sprite } from 'pixi.js';
import { getTileTexture } from '../../assets/loader.ts';
import {
  isKitchenCell,
  isPerimeterWallCell,
  mapZonesForGrid,
  openDoorCellsForRoom,
  perimeterWallEdge,
  type FloorRoomId,
} from '../../domain/floor/starter-map.ts';
import { gridToWorld, TILE_PX, type CameraState } from '../coordinates.ts';

const FLOOR_COLOR = 0x3d3d5c;
const GRID_LINE_COLOR = 0x2a2a40;

export class GridLayer {
  readonly view = new Container();
  private floorContainer = new Container();
  private wallContainer = new Container();
  private doorSprites: Sprite[] = [];
  private gridLines = new Graphics();
  private lastKey = '';
  private doorOpen = false;

  constructor() {
    this.view.addChild(this.floorContainer);
    this.view.addChild(this.wallContainer);
    this.view.addChild(this.gridLines);
  }

  sync(
    gridW: number,
    gridH: number,
    _camera: CameraState,
    opts: {
      doorOpen?: boolean;
      kitchenAnnexOwned?: boolean;
      room?: FloorRoomId;
    } = {},
  ): void {
    const doorOpen = Boolean(opts.doorOpen);
    const kitchenAnnexOwned = Boolean(opts.kitchenAnnexOwned);
    const room: FloorRoomId = opts.room ?? 'main';
    const floorA = getTileTexture('floor_a');
    const floorB = getTileTexture('floor_b');
    const kitchenA = getTileTexture('floor_kitchen_a') ?? floorA;
    const kitchenB = getTileTexture('floor_kitchen_b') ?? floorB;
    const wallN = getTileTexture('wall_n') ?? getTileTexture('wall');
    const wallE = getTileTexture('wall_e') ?? wallN;
    const wallS = getTileTexture('wall_s') ?? wallN;
    const wallW = getTileTexture('wall_w') ?? wallN;
    const doorClosed = getTileTexture('door');
    const doorOpenTex = getTileTexture('door_open') ?? doorClosed;
    const key = `${gridW}x${gridH}:room${room}:annex${kitchenAnnexOwned}:${Boolean(floorA)}:${Boolean(kitchenA)}:${Boolean(wallN)}:${Boolean(wallE)}`;

    if (key !== this.lastKey) {
      this.lastKey = key;
      this.floorContainer.removeChildren();
      this.wallContainer.removeChildren();
      this.doorSprites = [];

      const zones = mapZonesForGrid(gridW, gridH, { room });
      const openDoors = openDoorCellsForRoom(room, gridW, gridH, kitchenAnnexOwned);
      const doorKeys = new Set(openDoors.map((d) => `${d.x},${d.y}`));

      for (let gy = 0; gy < gridH; gy += 1) {
        for (let gx = 0; gx < gridW; gx += 1) {
          const { x, y } = gridToWorld(gx, gy);
          const useA = (gx + gy) % 2 === 0;
          const inKitchen = isKitchenCell(zones, gx, gy);
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

      const wallByEdge = {
        n: wallN,
        e: wallE,
        s: wallS,
        w: wallW,
      } as const;

      const placeWall = (gx: number, gy: number, isDoor: boolean) => {
        const { x, y } = gridToWorld(gx, gy);
        const edge = perimeterWallEdge(gx, gy, gridW, gridH);
        const texture = isDoor ? doorClosed : edge ? wallByEdge[edge] : wallN;
        if (texture) {
          const tile = new Sprite(texture);
          tile.roundPixels = true;
          tile.width = TILE_PX;
          tile.height = TILE_PX;
          tile.position.set(x, y);
          this.wallContainer.addChild(tile);
          if (isDoor) this.doorSprites.push(tile);
          return;
        }
        const block = new Graphics();
        block.rect(x, y, TILE_PX, TILE_PX).fill(isDoor ? 0x5a3a22 : 0x5c4a3a);
        this.wallContainer.addChild(block);
      };

      for (let gy = 0; gy < gridH; gy += 1) {
        for (let gx = 0; gx < gridW; gx += 1) {
          if (!isPerimeterWallCell(gx, gy, gridW, gridH)) continue;
          const isDoor = doorKeys.has(`${gx},${gy}`);
          placeWall(gx, gy, isDoor);
        }
      }
      this.doorOpen = !doorOpen; // force texture refresh below
    }

    if (this.doorSprites.length > 0 && doorOpen !== this.doorOpen) {
      this.doorOpen = doorOpen;
      const tex = doorOpen ? doorOpenTex : doorClosed;
      if (tex) {
        for (const sprite of this.doorSprites) {
          sprite.texture = tex;
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
