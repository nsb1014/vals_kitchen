import { loadRestaurantAtlases } from './loader.ts';
import { bindAudioUnlock, preloadAudio, startMusicLoop } from './audio.ts';
import { preloadFoodIconManifest } from './food-icon-manifest.ts';

export async function bootstrapRuntimeAssets(options: {
  surface: HTMLElement;
  onRestaurantAtlasesReady: () => void;
}): Promise<() => void> {
  const teardownAudio = bindAudioUnlock(options.surface);

  void Promise.all([loadRestaurantAtlases(), preloadFoodIconManifest()])
    .then(() => {
      options.onRestaurantAtlasesReady();
      window.dispatchEvent(new Event('food-atlas-ready'));
    })
    .catch((error) => console.warn('Asset preload failed', error));

  options.surface.addEventListener(
    'pointerdown',
    () => {
      void preloadAudio();
      startMusicLoop();
    },
    { once: true, passive: true },
  );

  return teardownAudio;
}

export async function preloadFoodIconsIfNeeded(): Promise<void> {
  await preloadFoodIconManifest();
  window.dispatchEvent(new Event('food-atlas-ready'));
}
