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
] as const;

export type MountedMetaScreen = (typeof MOUNTED_META_SCREENS)[number];

export function isMountedMetaScreen(screenId: string): screenId is MountedMetaScreen {
  return (MOUNTED_META_SCREENS as readonly string[]).includes(screenId);
}

export function subscribeScreenFromStore(
  subscribe: (listener: () => void) => () => void,
  getScreen: () => string,
): () => void {
  return subscribe(() => {
    showScreen(getScreen());
  });
}

export function getActiveScreen(): string | null {
  const root = document.querySelector('#game-root') as HTMLElement | null;
  return root?.dataset.screen ?? null;
}
