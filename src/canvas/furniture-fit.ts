import { TILE_PX } from './coordinates.ts';

/** Legacy chair names now size the small backless stool artwork. */
export const CHAIR_MAX_OVERHANG_PX = 0;
export const CHAIR_DRAW_WIDTH_PX = 24;
export const CHAIR_DRAW_HEIGHT_PX = 22;
/** Table width is authored against the shared actor scale. */
export const TABLE_DRAW_WIDTH_PX = 44;
export const TABLE_MAX_HEIGHT_PX = 56;
/** Kitchen stations keep taller ¾ silhouettes. */
export const STATION_DRAW_WIDTH_PX = 34;
/** Décor keeps real relative scale instead of forcing every prop into one box. */
export const DECOR_DRAW_WIDTH_PX: Readonly<Record<string, number>> = {
  decor_plant: 30,
  decor_flowers: 20,
  decor_rug: 46,
  decor_lamp: 32,
  decor_sign: 32,
};

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
  const targetWidth =
    DECOR_DRAW_WIDTH_PX[itemKey] ??
    (itemKey.length > 0 ? STATION_DRAW_WIDTH_PX : TILE_PX);
  const scale = targetWidth / Math.max(1, texture.width);
  return { w: texture.width * scale, h: texture.height * scale };
}

export function furnitureDrawOffset(w: number, h: number): { x: number; y: number } {
  return { x: (TILE_PX - w) / 2, y: TILE_PX - h };
}

/**
 * Depth for Y-sorted props.
 * Tables and tall stations sort at their tile's south edge so nearby actors
 * pass behind or in front according to their feet. Rugs alone stay on the
 * raw floor plane and therefore never occlude an actor.
 */
export function furnitureDepthY(gridY: number, itemKey = ''): number {
  if (itemKey === 'decor_rug') {
    return gridY;
  }
  return (gridY + 1) * TILE_PX;
}

export function chairDepthY(seatedFeetY: number): number {
  return seatedFeetY - 1;
}

/** Seated guests use natural feet Y around the table's south-edge depth. */
export function seatedActorDepthY(seatedFeetY: number): number {
  return seatedFeetY;
}

/** Keep backless stools below the authored seated hip line. */
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
