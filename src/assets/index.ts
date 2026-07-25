export { ATLAS_MANIFEST, AUDIO_MANIFEST, CREDITS_URL, type AtlasId, type SfxId } from './manifest.ts';
export { foodIconSpriteName } from './ingredient-icons.ts';
export { spriteNameForItemKey, fallbackTintForItemKey } from './furniture-sprites.ts';
export { loadCreditsManifest, renderCreditsHtml, clearCreditsCache, type CreditsManifest, type CreditEntry } from './credits.ts';
export {
  bindAudioUnlock,
  unlockAudioOnGesture,
  playSfx,
  startMusicLoop,
  stopMusicLoop,
  syncMusicEnabled,
  preloadAudio,
  setAudioFlagBridge,
} from './audio.ts';
export { renderFoodIconHtml, preloadFoodIconManifest, isFoodIconManifestReady } from './food-icon.ts';
