import { TILE_PX } from './coordinates.ts';

/**
 * Max chair overhang above the seat-cell top.
 * Side chairs tuck under the table lip; keep enough silhouette without burying tops.
 */
export const CHAIR_MAX_OVERHANG_PX = 14;
export const CHAIR_DRAW_WIDTH_PX = 26;
export const CHAIR_DRAW_HEIGHT_PX = 39;
export const TABLE_DRAW_WIDTH_PX = 36;
/** Kitchen stations/counters need presence without dwarfing actors. */
export const STATION_DRAW_WIDTH_PX = 34;

export function furnitureDrawSize(
  texture: { width: number; height: number },
  itemKey = '',
): { w: number; h: number } {
  const targetWidth = itemKey.startsWith('table')
    ? TABLE_DRAW_WIDTH_PX
    : itemKey.length > 0
      ? STATION_DRAW_WIDTH_PX
      : TILE_PX;
  const scale = targetWidth / Math.max(1, texture.width);
  return { w: texture.width * scale, h: texture.height * scale };
}

export function furnitureDrawOffset(w: number, h: number): { x: number; y: number } {
  return { x: (TILE_PX - w) / 2, y: TILE_PX - h };
}

export function furnitureDepthY(gridY: number): number {
  return (gridY + 1) * TILE_PX;
}

export function chairDepthY(seatedFeetY: number): number {
  return seatedFeetY - 1;
}

/**
 * Seated diners paint just above their chair. Camera-biased sit anchors already
 * put feet past the same-row tabletop so natural Y-sort keeps them in front of
 * the flat table sprite without boosting them onto the table surface.
 */
export function seatedActorDepthY(seatedFeetY: number, _tableDepthY?: number): number {
  return seatedFeetY;
}

/** Keep chairs subordinate to the table and seated actor silhouettes. */
export function chairDrawFit(texture: { width: number; height: number }): {
  w: number;
  h: number;
  x: number;
  y: number;
} {
  const raw = furnitureDrawSize(texture);
  const maxH = Math.min(TILE_PX + CHAIR_MAX_OVERHANG_PX, CHAIR_DRAW_HEIGHT_PX);
  const scale = Math.min(CHAIR_DRAW_WIDTH_PX / raw.w, maxH / raw.h, 1);
  const w = raw.w * scale;
  const h = raw.h * scale;
  return { w, h, ...furnitureDrawOffset(w, h) };
}
