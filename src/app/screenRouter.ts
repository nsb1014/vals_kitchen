import type { ScreenId } from '../store/game-store.ts';

export function showScreen(screenId: string): void {
  const root = document.querySelector('#game-root') as HTMLElement | null;
  if (!root) return;
  root.dataset.screen = screenId;
}

/** Screens mounted into `#screens-mount` (meta / chrome routes). */
export const MOUNTED_META_SCREENS = [
  'recipes',
  'settings',
  'shop',
  'rating',
  'inspector',
] as const;

export type MountedMetaScreen = (typeof MOUNTED_META_SCREENS)[number];

export function isMountedMetaScreen(
  screenId: string,
): screenId is MountedMetaScreen {
  return (MOUNTED_META_SCREENS as readonly string[]).includes(screenId);
}

/** Last non-settings route — Settings close returns here (default: restaurant). */
let settingsReturnScreen: ScreenId = 'restaurant';
let trackedScreen: ScreenId | string = 'restaurant';
let inspectorMountStarted = false;

export function resolveSettingsReturnScreen(
  previous: string | null | undefined,
): ScreenId {
  if (!previous || previous === 'settings') return 'restaurant';
  return previous as ScreenId;
}

export function getSettingsReturnScreen(): ScreenId {
  return resolveSettingsReturnScreen(settingsReturnScreen);
}

export function trackScreenChange(screenId: string): void {
  if (screenId !== 'settings') {
    settingsReturnScreen = resolveSettingsReturnScreen(screenId);
  } else if (trackedScreen !== 'settings') {
    settingsReturnScreen = resolveSettingsReturnScreen(trackedScreen);
  }
  trackedScreen = screenId;
}

export function resetSettingsReturnTracking(
  initial: ScreenId = 'restaurant',
): void {
  settingsReturnScreen = initial;
  trackedScreen = initial;
}

export function ensureMountedMetaScreens(): void {
  if (typeof document === 'undefined' || inspectorMountStarted) return;
  const mount = document.querySelector('#screens-mount');
  if (!mount || mount.querySelector('#inspector-screen')) {
    if (mount?.querySelector('#inspector-screen')) inspectorMountStarted = true;
    return;
  }
  inspectorMountStarted = true;
  void import('../ui/screens/FlavorInspectorScreen.ts').then(
    ({ mountFlavorInspectorScreen }) => {
      if (!mount.querySelector('#inspector-screen')) {
        mountFlavorInspectorScreen(mount as HTMLElement);
      }
    },
  );
}

export function subscribeScreenFromStore(
  subscribe: (listener: () => void) => () => void,
  getScreen: () => string,
): () => void {
  const initial = getScreen();
  trackScreenChange(initial);
  showScreen(initial);
  ensureMountedMetaScreens();
  return subscribe(() => {
    const screen = getScreen();
    trackScreenChange(screen);
    showScreen(screen);
    if (screen === 'inspector') ensureMountedMetaScreens();
  });
}

export function getActiveScreen(): string | null {
  const root = document.querySelector('#game-root') as HTMLElement | null;
  return root?.dataset.screen ?? null;
}
