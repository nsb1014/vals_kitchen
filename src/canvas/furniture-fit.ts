import { TILE_PX } from './coordinates.ts';

/**
 * Max chair overhang into the tile above.
 * Sit anchors already tuck chairs under the table lip; allow enough silhouette
 * for a readable ¾ chair without burying the tabletop.
 */
export const CHAIR_MAX_OVERHANG_PX = 14;

export function furnitureDrawSize(texture: { width: number; height: number }): { w: number; h: number } {
  const scale = TILE_PX / 32;
  return { w: texture.width * scale, h: texture.height * scale };
}

export function furnitureDrawOffset(w: number, h: number): { x: number; y: number } {
  return { x: (TILE_PX - w) / 2, y: TILE_PX - h };
}

/** Feet-align chairs but cap height so 32×48 art does not bury the table to the north. */
export function chairDrawFit(texture: { width: number; height: number }): {
  w: number;
  h: number;
  x: number;
  y: number;
} {
  const raw = furnitureDrawSize(texture);
  const maxH = TILE_PX + CHAIR_MAX_OVERHANG_PX;
  const scale = raw.h > maxH ? maxH / raw.h : 1;
  const w = raw.w * scale;
  const h = raw.h * scale;
  return { w, h, ...furnitureDrawOffset(w, h) };
}
