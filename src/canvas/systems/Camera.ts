import {
  computeCameraCenter,
  type CameraState,
} from '../coordinates.ts';

export class Camera {
  state: CameraState = {
    x: 0,
    y: 0,
    scale: 1,
    stageOffsetX: 0,
    stageOffsetY: 0,
  };

  centerOnGrid(gridW: number, gridH: number, viewW: number, viewH: number): void {
    this.state = computeCameraCenter(gridW, gridH, viewW, viewH);
  }

  /** Center the view on a world point; clamp so the viewport stays over the map. */
  followWorldPoint(
    worldX: number,
    worldY: number,
    viewW: number,
    viewH: number,
    mapWpx: number,
    mapHpx: number,
  ): void {
    const scale = this.state.scale;
    const scaledMapW = mapWpx * scale;
    const scaledMapH = mapHpx * scale;
    const stageOffsetX =
      scaledMapW < viewW ? Math.max(0, Math.floor((viewW - scaledMapW) / 2)) : 0;
    const stageOffsetY =
      scaledMapH < viewH ? Math.max(0, Math.floor((viewH - scaledMapH) / 2)) : 0;
    const visibleWorldW = (viewW - stageOffsetX * 2) / scale;
    const visibleWorldH = (viewH - stageOffsetY * 2) / scale;

    let x = worldX - visibleWorldW / 2;
    let y = worldY - visibleWorldH / 2;
    x = Math.max(0, Math.min(x, Math.max(0, mapWpx - visibleWorldW)));
    y = Math.max(0, Math.min(y, Math.max(0, mapHpx - visibleWorldH)));

    this.state = {
      ...this.state,
      x,
      y,
      stageOffsetX,
      stageOffsetY,
    };
  }
}
