import { Spritesheet, Texture } from 'pixi.js';
import { ATLAS_MANIFEST, type AtlasId } from './manifest.ts';

type SheetMap = Partial<Record<AtlasId, Spritesheet>>;

let restaurantLoaded = false;
const sheets: SheetMap = {};

function textureFromSheet(sheet: Spritesheet, name: string): Texture | null {
  const textures = sheet.textures as Record<string, Texture | undefined>;
  return textures[name] ?? null;
}

export function restaurantAtlasScaleMode(id: AtlasId): 'nearest' | 'linear' {
  // Room surfaces are edge-to-edge repeating tiles, so nearest filtering keeps
  // adjacent atlas cells from bleeding into their seams. Illustrated actors
  // and furniture have transparent padding and need smooth downsampling.
  return id === 'tiles' ? 'nearest' : 'linear';
}

async function loadTexture(url: string, scaleMode: 'nearest' | 'linear'): Promise<Texture> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const texture = Texture.from(image);
  texture.source.scaleMode = scaleMode;
  // Binary-hardened atlases are straight alpha; avoid double-multiply haze.
  texture.source.alphaMode = 'no-premultiply-alpha';
  return texture;
}

async function loadSpritesheet(
  jsonUrl: string,
  scaleMode: 'nearest' | 'linear',
): Promise<Spritesheet> {
  const data = (await fetch(jsonUrl).then((res) => res.json())) as Spritesheet['data'];
  const pngUrl = jsonUrl.replace(/\.json$/, '.png');
  const texture = await loadTexture(pngUrl, scaleMode);
  const sheet = new Spritesheet(texture, data);
  await sheet.parse();
  return sheet;
}

export async function loadRestaurantAtlases(): Promise<void> {
  if (restaurantLoaded) return;
  const ids: AtlasId[] = ['tiles', 'furniture', 'characters'];
  await Promise.all(
    ids.map(async (id) => {
      sheets[id] = await loadSpritesheet(ATLAS_MANIFEST[id], restaurantAtlasScaleMode(id));
    }),
  );
  restaurantLoaded = true;
}

export function isRestaurantAtlasesReady(): boolean {
  return restaurantLoaded;
}

export function getTileTexture(
  name:
    | 'floor_a'
    | 'floor_b'
    | 'floor_kitchen_a'
    | 'floor_kitchen_b'
    | 'wall'
    | 'wall_n'
    | 'wall_e'
    | 'wall_s'
    | 'wall_w'
    | 'door'
    | 'door_open',
): Texture | null {
  const sheet = sheets.tiles;
  if (!sheet) return null;
  return textureFromSheet(sheet, name);
}

export function getFurnitureTexture(spriteName: string): Texture | null {
  const sheet = sheets.furniture;
  if (!sheet) return null;
  return textureFromSheet(sheet, spriteName);
}

export function getCharacterTexture(name = 'customer'): Texture | null {
  const sheet = sheets.characters;
  if (!sheet) return null;
  return textureFromSheet(sheet, name);
}

export function destroyAtlases(): void {
  for (const id of Object.keys(sheets) as AtlasId[]) {
    sheets[id]?.destroy(true);
    delete sheets[id];
  }
  restaurantLoaded = false;
}
