import { describe, expect, it } from 'vitest';
import {
  ART_TILE_PX,
  TILE_PX,
  computeCameraCenter,
  computeGridScale,
  computeGrabOffset,
  gridToWorld,
  screenToDragGrid,
  screenToGrid,
  screenToWorld,
  snapDragOriginToGrid,
  snapWorldToGrid,
  worldToGrid,
  worldToScreen,
} from '../canvas/coordinates.ts';

describe('coordinates', () => {
  it('uses 16px art at 2x scale', () => {
    expect(ART_TILE_PX).toBe(16);
    expect(TILE_PX).toBe(32);
  });

  it('converts grid to world pixels', () => {
    expect(gridToWorld(0, 0)).toEqual({ x: 0, y: 0 });
    expect(gridToWorld(3, 2)).toEqual({ x: 96, y: 64 });
  });

  it('converts world to grid with floor', () => {
    expect(worldToGrid(0, 0)).toEqual({ gx: 0, gy: 0 });
    expect(worldToGrid(31, 63)).toEqual({ gx: 0, gy: 1 });
    expect(worldToGrid(32, 64)).toEqual({ gx: 1, gy: 2 });
  });

  it('snaps world coordinates to nearest tile', () => {
    expect(snapWorldToGrid(8, 8)).toEqual({ gx: 0, gy: 0 });
    expect(snapWorldToGrid(20, 20)).toEqual({ gx: 1, gy: 1 });
    expect(snapWorldToGrid(48, 16)).toEqual({ gx: 2, gy: 1 });
  });

  it('maps world through camera to screen', () => {
    const camera = computeCameraCenter(4, 4, 390, 844);
    expect(worldToScreen(0, 0, camera)).toEqual({
      x: camera.stageOffsetX,
      y: camera.stageOffsetY,
    });
    expect(worldToScreen(32, 32, camera)).toEqual({
      x: camera.stageOffsetX + 32 * camera.scale,
      y: camera.stageOffsetY + 32 * camera.scale,
    });
  });

  it('inverts screen coordinates through camera offset', () => {
    const camera = computeCameraCenter(4, 4, 390, 844);
    const screenPoint = worldToScreen(64, 96, camera);
    expect(screenToWorld(screenPoint.x, screenPoint.y, camera)).toEqual({ x: 64, y: 96 });
  });

  it('maps screen pointer to the grid cell underneath it', () => {
    const camera = computeCameraCenter(4, 4, 390, 844);
    const { gx, gy } = screenToGrid(
      camera.stageOffsetX + 40 * camera.scale,
      camera.stageOffsetY + 40 * camera.scale,
      camera,
    );
    expect({ gx, gy }).toEqual({ gx: 1, gy: 1 });
  });

  it('centers undersized grids in the viewport with integer scale-to-fit', () => {
    const camera = computeCameraCenter(4, 4, 390, 844);
    const scale = computeGridScale(4, 4, 390, 844);
    expect(scale).toBe(3);
    expect(camera.scale).toBe(3);
    expect(camera.stageOffsetX).toBe(Math.floor((390 - 4 * TILE_PX * scale) / 2));
    expect(camera.stageOffsetY).toBe(Math.floor((844 - 4 * TILE_PX * scale) / 2));
  });

  it('scales up small grids on desktop viewports', () => {
    const scale = computeGridScale(4, 4, 1280, 800);
    expect(scale).toBeGreaterThan(1);
  });

  it('uses exact fit for starter rooms that would otherwise be postage stamps', () => {
    const scale = computeGridScale(10, 8, 1024, 310);
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThan(2);
    expect(8 * TILE_PX * scale).toBeLessThanOrEqual(310);
  });

  describe('drag snap with grab offset', () => {
    it('exposes ambiguous snap when pointer alone hits a tile center boundary', () => {
      const tileCenterY = gridToWorld(0, 2).y + TILE_PX / 2;
      expect(snapWorldToGrid(16, tileCenterY)).toEqual({ gx: 1, gy: 3 });
    });

    it('snaps to the tile whose center the item visually covers when grabbed at item center', () => {
      const grabOffset = computeGrabOffset(16, 16, 0, 0);
      expect(grabOffset).toEqual({ x: 16, y: 16 });

      const targetCenter = gridToWorld(0, 2);
      const pointerAtTargetCenter = {
        x: targetCenter.x + TILE_PX / 2,
        y: targetCenter.y + TILE_PX / 2,
      };
      expect(snapDragOriginToGrid(pointerAtTargetCenter.x, pointerAtTargetCenter.y, grabOffset)).toEqual({
        gx: 0,
        gy: 2,
      });
    });

    it('uses half-up tie-break when origin sits on an exact half-tile boundary', () => {
      const grabOffset = { x: 0, y: 0 };
      expect(snapDragOriginToGrid(16, 16, grabOffset)).toEqual({ gx: 1, gy: 1 });
      expect(snapDragOriginToGrid(48, 48, grabOffset)).toEqual({ gx: 2, gy: 2 });
    });

    it('matches preview and drop through camera stage offset at device viewport', () => {
      const camera = computeCameraCenter(4, 4, 390, 844);
      const grabOffset = computeGrabOffset(16, 16, 0, 0);
      const targetCenter = gridToWorld(1, 2);
      const sx = camera.stageOffsetX + (targetCenter.x + TILE_PX / 2) * camera.scale;
      const sy = camera.stageOffsetY + (targetCenter.y + TILE_PX / 2) * camera.scale;

      expect(screenToDragGrid(sx, sy, camera, grabOffset)).toEqual({ gx: 1, gy: 2 });
      expect(screenToGrid(sx, sy, camera)).toEqual({ gx: 1, gy: 2 });
    });

    it('keeps every point inside a tile mapped to that tile', () => {
      const camera = computeCameraCenter(4, 4, 390, 844);
      const tile = gridToWorld(1, 2);
      for (const [offsetX, offsetY] of [
        [1, 1],
        [TILE_PX / 2, TILE_PX / 2],
        [TILE_PX - 1, TILE_PX - 1],
      ]) {
        const screen = worldToScreen(tile.x + offsetX, tile.y + offsetY, camera);
        expect(screenToGrid(screen.x, screen.y, camera)).toEqual({
          gx: 1,
          gy: 2,
        });
      }
    });
  });
});
