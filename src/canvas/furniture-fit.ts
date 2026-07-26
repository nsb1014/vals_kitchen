import { TILE_PX } from './coordinates.ts';

export function furnitureDrawSize(texture: { width: number; height: number }): { w: number; h: number } {
  const scale = TILE_PX / 32;
  return { w: texture.width * scale, h: texture.height * scale };
}

export function furnitureDrawOffset(w: number, h: number): { x: number; y: number } {
  return { x: (TILE_PX - w) / 2, y: TILE_PX - h };
}
