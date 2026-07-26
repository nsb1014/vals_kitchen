import {
  TILE_PX,
  computeCameraCenter,
  computeGridScale,
  type CameraState,
} from '../coordinates.ts';

export interface FollowTarget {
  x: number;
  y: number;
  scale: number;
  stageOffsetX: number;
  stageOffsetY: number;
}

export function worldTransformFromCamera(camera: CameraState): {
  x: number;
  y: number;
  scale: number;
} {
  return {
    x: camera.stageOffsetX - camera.x * camera.scale,
    y: camera.stageOffsetY - camera.y * camera.scale,
    scale: camera.scale,
  };
}

export function computeFollowTarget(
  _currentState: CameraState,
  worldX: number,
  worldY: number,
  viewW: number,
  viewH: number,
  mapWpx: number,
  mapHpx: number,
): FollowTarget {
  const gridW = Math.max(1, Math.round(mapWpx / TILE_PX));
  const gridH = Math.max(1, Math.round(mapHpx / TILE_PX));
  const scale = computeGridScale(gridW, gridH, viewW, viewH);
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

  return { x, y, scale, stageOffsetX, stageOffsetY };
}

export function lerpFollowPosition(
  currentX: number,
  currentY: number,
  targetX: number,
  targetY: number,
  lerp: number,
): { x: number; y: number } {
  return {
    x: currentX + (targetX - currentX) * lerp,
    y: currentY + (targetY - currentY) * lerp,
  };
}

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
    const target = computeFollowTarget(
      this.state,
      worldX,
      worldY,
      viewW,
      viewH,
      mapWpx,
      mapHpx,
    );
    this.state = {
      ...this.state,
      ...target,
    };
  }

  /** Lerp toward the clamped follow target; use onTick for smooth tracking. */
  followWorldPointSmooth(
    worldX: number,
    worldY: number,
    viewW: number,
    viewH: number,
    mapWpx: number,
    mapHpx: number,
    lerp = 0.18,
  ): void {
    const target = computeFollowTarget(
      this.state,
      worldX,
      worldY,
      viewW,
      viewH,
      mapWpx,
      mapHpx,
    );
    const { x, y } = lerpFollowPosition(this.state.x, this.state.y, target.x, target.y, lerp);
    this.state = {
      ...this.state,
      x,
      y,
      scale: target.scale,
      stageOffsetX: target.stageOffsetX,
      stageOffsetY: target.stageOffsetY,
    };
  }
}
