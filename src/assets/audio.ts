import { AUDIO_MANIFEST, type SfxId } from './manifest.ts';

let unlocked = false;
let musicEl: HTMLAudioElement | null = null;
const sfxCache = new Map<string, HTMLAudioElement>();

function getStoreAudioFlags(): { audioEnabled: boolean; musicEnabled: boolean } {
  if (typeof window === 'undefined') {
    return { audioEnabled: true, musicEnabled: false };
  }
  const globalStore = (window as unknown as { __gameAudioFlags?: { audioEnabled: boolean; musicEnabled: boolean } })
    .__gameAudioFlags;
  return globalStore ?? { audioEnabled: true, musicEnabled: false };
}

export function setAudioFlagBridge(flags: { audioEnabled: boolean; musicEnabled: boolean }): void {
  if (typeof window !== 'undefined') {
    (window as unknown as { __gameAudioFlags: typeof flags }).__gameAudioFlags = flags;
  }
}

export async function unlockAudioOnGesture(): Promise<void> {
  if (unlocked || typeof window === 'undefined') return;
  unlocked = true;
  // Prime silent play to satisfy mobile gesture policy without audible autoplay.
  const probe = new Audio();
  probe.volume = 0;
  try {
    await probe.play();
    probe.pause();
  } catch {
    // Ignore — user may still hear SFX after explicit interaction.
  }
}

function loadSfx(id: SfxId): HTMLAudioElement {
  const url = AUDIO_MANIFEST[id];
  const cached = sfxCache.get(url);
  if (cached) return cached;
  const el = new Audio(url);
  el.preload = 'auto';
  sfxCache.set(url, el);
  return el;
}

export function playSfx(id: SfxId, volume = 0.85): void {
  if (!unlocked) return;
  const { audioEnabled } = getStoreAudioFlags();
  if (!audioEnabled) return;
  const el = loadSfx(id);
  const node = el.cloneNode(true) as HTMLAudioElement;
  node.volume = volume;
  void node.play().catch(() => undefined);
}

export function startMusicLoop(volume = 0.35): void {
  if (!unlocked || typeof window === 'undefined') return;
  const { musicEnabled } = getStoreAudioFlags();
  if (!musicEnabled) return;
  if (!musicEl) {
    musicEl = new Audio(AUDIO_MANIFEST.musicLoop);
    musicEl.loop = true;
    musicEl.preload = 'auto';
  }
  musicEl.volume = volume;
  if (musicEl.paused) {
    void musicEl.play().catch(() => undefined);
  }
}

export function stopMusicLoop(): void {
  if (!musicEl) return;
  musicEl.pause();
  musicEl.currentTime = 0;
}

export function syncMusicEnabled(enabled: boolean): void {
  if (!enabled) stopMusicLoop();
  else if (unlocked) startMusicLoop();
}

export async function preloadAudio(): Promise<void> {
  if (typeof window === 'undefined') return;
  for (const id of ['serve', 'review', 'purchase', 'placement', 'dayOpen', 'dayClose', 'uiClick'] as SfxId[]) {
    loadSfx(id);
  }
}

export function bindAudioUnlock(root: HTMLElement): () => void {
  const handler = () => {
    void unlockAudioOnGesture();
    void preloadAudio();
  };
  root.addEventListener('pointerdown', handler, { once: true, passive: true });
  return () => root.removeEventListener('pointerdown', handler);
}
