export const ART_TILE_PX = 16;
export const TILE_PX = 32;

export interface Point {
  x: number;
  y: number;
}

export interface CameraState {
  x: number;
  y: number;
  stageOffsetX: number;
  stageOffsetY: number;
}

export function gridToWorld(gx: number, gy: number): Point {
  return { x: gx * TILE_PX, y: gy * TILE_PX };
}

export function worldToGrid(wx: number, wy: number): { gx: number; gy: number } {
  return {
    gx: Math.floor(wx / TILE_PX),
    gy: Math.floor(wy / TILE_PX),
  };
}

/** Snap placement origin (top-left of footprint) to nearest grid cell. */
export function snapWorldToGrid(wx: number, wy: number): { gx: number; gy: number } {
  return {
    gx: Math.round(wx / TILE_PX),
    gy: Math.round(wy / TILE_PX),
  };
}

/** Pointer world position minus placement origin at grab time. */
export function computeGrabOffset(
  pointerWorldX: number,
  pointerWorldY: number,
  placementGx: number,
  placementGy: number,
): Point {
  const origin = gridToWorld(placementGx, placementGy);
  return {
    x: pointerWorldX - origin.x,
    y: pointerWorldY - origin.y,
  };
}

/**
 * Snap a dragged item's origin to grid using the grab offset captured at pointerdown.
 * Tie-break at exact half-tile boundaries: Math.round (half-up toward +infinity).
 */
export function snapDragOriginToGrid(
  pointerWorldX: number,
  pointerWorldY: number,
  grabOffset: Point,
): { gx: number; gy: number } {
  return snapWorldToGrid(pointerWorldX - grabOffset.x, pointerWorldY - grabOffset.y);
}

export function screenToDragGrid(
  sx: number,
  sy: number,
  camera: CameraState,
  grabOffset: Point,
): { gx: number; gy: number } {
  const world = screenToWorld(sx, sy, camera);
  return snapDragOriginToGrid(world.x, world.y, grabOffset);
}

export function worldToScreen(wx: number, wy: number, camera: CameraState): Point {
  return {
    x: wx - camera.x + camera.stageOffsetX,
    y: wy - camera.y + camera.stageOffsetY,
  };
}

export function screenToWorld(sx: number, sy: number, camera: CameraState): Point {
  return {
    x: sx - camera.stageOffsetX + camera.x,
    y: sy - camera.stageOffsetY + camera.y,
  };
}

export function screenToGrid(sx: number, sy: number, camera: CameraState): {
  gx: number;
  gy: number;
} {
  const world = screenToWorld(sx, sy, camera);
  return snapWorldToGrid(world.x, world.y);
}

export function computeCameraCenter(
  gridW: number,
  gridH: number,
  viewW: number,
  viewH: number,
): CameraState {
  const worldW = gridW * TILE_PX;
  const worldH = gridH * TILE_PX;
  return {
    x: 0,
    y: 0,
    stageOffsetX: Math.max(0, Math.floor((viewW - worldW) / 2)),
    stageOffsetY: Math.max(0, Math.floor((viewH - worldH) / 2)),
  };
}
