export const ART_TILE_PX = 16;
export const TILE_PX = 32;

export interface Point {
  x: number;
  y: number;
}

export interface CameraState {
  x: number;
  y: number;
  scale: number;
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
    x: (wx - camera.x) * camera.scale + camera.stageOffsetX,
    y: (wy - camera.y) * camera.scale + camera.stageOffsetY,
  };
}

export function screenToWorld(sx: number, sy: number, camera: CameraState): Point {
  return {
    x: (sx - camera.stageOffsetX) / camera.scale + camera.x,
    y: (sy - camera.stageOffsetY) / camera.scale + camera.y,
  };
}

export function screenToGrid(sx: number, sy: number, camera: CameraState): {
  gx: number;
  gy: number;
} {
  const world = screenToWorld(sx, sy, camera);
  // Pointer input selects the cell underneath the pointer. Rounding here made
  // the right/bottom half of every tile target its neighbor, so movement and
  // station taps consistently landed one cell away from the visual target.
  return worldToGrid(world.x, world.y);
}

/** Fit the grid in the viewport. Prefer integer scale for pixel-crisp tiles; when
 *  floor(scale)===1 would leave large empty margins, use exact fit instead so
 *  starter rooms are not postage stamps on wide short canvases.
 */
export function computeGridScale(
  gridW: number,
  gridH: number,
  viewW: number,
  viewH: number,
): number {
  const worldW = gridW * TILE_PX;
  const worldH = gridH * TILE_PX;
  if (worldW <= 0 || worldH <= 0 || viewW <= 0 || viewH <= 0) return 1;
  const exact = Math.min(viewW / worldW, viewH / worldH);
  if (!Number.isFinite(exact) || exact <= 0) return 1;
  const integer = Math.max(1, Math.floor(exact));
  if (integer >= 2) return integer;
  const fillW = (worldW * integer) / viewW;
  const fillH = (worldH * integer) / viewH;
  if (fillW >= 0.55 && fillH >= 0.55) return integer;
  return Math.round(exact * 100) / 100;
}

export function computeCameraCenter(
  gridW: number,
  gridH: number,
  viewW: number,
  viewH: number,
): CameraState {
  const worldW = gridW * TILE_PX;
  const worldH = gridH * TILE_PX;
  const scale = computeGridScale(gridW, gridH, viewW, viewH);
  const scaledW = worldW * scale;
  const scaledH = worldH * scale;
  return {
    x: 0,
    y: 0,
    scale,
    stageOffsetX: Math.max(0, Math.floor((viewW - scaledW) / 2)),
    stageOffsetY: Math.max(0, Math.floor((viewH - scaledH) / 2)),
  };
}
