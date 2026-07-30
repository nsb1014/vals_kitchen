import { TILE_PX } from './coordinates.ts';

/**
 * Max chair overhang above the seat-cell top.
 * Sized to match player-scale seated guests (see ActorLayer display heights).
 */
export const CHAIR_MAX_OVERHANG_PX = 22;
/** Sized for player-matched sit silhouettes (content-scaled). */
export const CHAIR_DRAW_WIDTH_PX = 34;
export const CHAIR_DRAW_HEIGHT_PX = 52;
/** Flat top-down tabletop width; height is capped so art does not swallow neighbors. */
export const TABLE_DRAW_WIDTH_PX = 30;
export const TABLE_MAX_HEIGHT_PX = TILE_PX + 10;
/** Kitchen stations keep taller ¾ silhouettes. */
export const STATION_DRAW_WIDTH_PX = 34;

export function furnitureDrawSize(
  texture: { width: number; height: number },
  itemKey = '',
): { w: number; h: number } {
  if (itemKey.startsWith('table')) {
    const scale = Math.min(
      TABLE_DRAW_WIDTH_PX / Math.max(1, texture.width),
      TABLE_MAX_HEIGHT_PX / Math.max(1, texture.height),
    );
    return { w: texture.width * scale, h: texture.height * scale };
  }
  const targetWidth = itemKey.length > 0 ? STATION_DRAW_WIDTH_PX : TILE_PX;
  const scale = targetWidth / Math.max(1, texture.width);
  return { w: texture.width * scale, h: texture.height * scale };
}

export function furnitureDrawOffset(w: number, h: number): { x: number; y: number } {
  return { x: (TILE_PX - w) / 2, y: TILE_PX - h };
}

/**
 * Depth for Y-sorted props.
 * Flat tabletops sort under actors (they are floor-plane surfaces, not tall occluders).
 * Tall stations keep south-edge sorting so the player can walk behind them.
 */
export function furnitureDepthY(gridY: number, itemKey = ''): number {
  if (itemKey.startsWith('table')) {
    return gridY;
  }
  return (gridY + 1) * TILE_PX;
}

export function chairDepthY(seatedFeetY: number): number {
  return seatedFeetY - 1;
}

/** Seated guests use natural feet Y; tables no longer compete in the actor band. */
export function seatedActorDepthY(seatedFeetY: number): number {
  return seatedFeetY;
}

/** Keep chairs matched to player-scale seated guests. */
export function chairDrawFit(texture: { width: number; height: number }): {
  w: number;
  h: number;
  x: number;
  y: number;
} {
  const maxH = Math.min(TILE_PX + CHAIR_MAX_OVERHANG_PX, CHAIR_DRAW_HEIGHT_PX);
  const scale = Math.min(
    CHAIR_DRAW_WIDTH_PX / Math.max(1, texture.width),
    maxH / Math.max(1, texture.height),
  );
  const w = texture.width * scale;
  const h = texture.height * scale;
  return { w, h, ...furnitureDrawOffset(w, h) };
}
