/** DOM food icons — reads atlas JSON directly (no Pixi import). */

interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FoodAtlasJson {
  frames: Record<string, { frame: FrameRect }>;
  meta: { size: { w: number; h: number } };
}

let atlas: FoodAtlasJson | null = null;

export async function preloadFoodIconManifest(): Promise<void> {
  if (atlas) return;
  const res = await fetch('/assets/atlases/food.json');
  if (!res.ok) throw new Error(`food atlas json ${res.status}`);
  atlas = (await res.json()) as FoodAtlasJson;
}

export function isFoodIconManifestReady(): boolean {
  return atlas !== null;
}

export function foodIconBackgroundStyle(spriteName: string, displayPx = 32): string | null {
  if (!atlas) return null;
  const frame = atlas.frames[spriteName]?.frame;
  if (!frame) return null;
  const scale = displayPx / Math.max(frame.w, frame.h);
  const bgW = atlas.meta.size.w * scale;
  const bgH = atlas.meta.size.h * scale;
  const posX = -frame.x * scale;
  const posY = -frame.y * scale;
  return [
    `background-image:url('/assets/atlases/food.png')`,
    `background-position:${posX}px ${posY}px`,
    `background-size:${bgW}px ${bgH}px`,
    `width:${displayPx}px`,
    `height:${displayPx}px`,
    'overflow:hidden',
    'image-rendering:pixelated',
    'display:inline-block',
    'flex-shrink:0',
  ].join(';');
}
