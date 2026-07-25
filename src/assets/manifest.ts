/** Runtime-fetched atlases (not bundled into initial JS). */
export const ATLAS_MANIFEST = {
  tiles: '/assets/atlases/tiles.json',
  furniture: '/assets/atlases/furniture.json',
  food: '/assets/atlases/food.json',
  characters: '/assets/atlases/characters.json',
} as const;

export type AtlasId = keyof typeof ATLAS_MANIFEST;

export const AUDIO_MANIFEST = {
  serve: '/assets/sfx/serve.ogg',
  review: '/assets/sfx/review.ogg',
  purchase: '/assets/sfx/purchase.ogg',
  placement: '/assets/sfx/placement.ogg',
  dayOpen: '/assets/sfx/day-open.ogg',
  dayClose: '/assets/sfx/day-close.ogg',
  uiClick: '/assets/sfx/ui-click.ogg',
  musicLoop: '/assets/music/restaurant-loop.ogg',
} as const;

export type SfxId = Exclude<keyof typeof AUDIO_MANIFEST, 'musicLoop'>;

export const CREDITS_URL = '/assets/CREDITS.json';
