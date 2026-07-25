export function showScreen(screenId: string): void {
  const root = document.querySelector('#game-root') as HTMLElement | null;
  if (!root) return;
  root.dataset.screen = screenId;
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
