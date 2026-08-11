/** Manual reduced-motion override paired with prefers-reduced-motion CSS. */
export function applyAppShellMotionPreference(reduced: boolean): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const rootEl = document.querySelector('#game-root') as HTMLElement | null;
  if (reduced) {
    html.dataset.vkReducedMotion = 'true';
    rootEl?.setAttribute('data-vk-reduced-motion', 'true');
  } else {
    delete html.dataset.vkReducedMotion;
    rootEl?.removeAttribute('data-vk-reduced-motion');
  }
}

/**
 * True when OS prefers-reduced-motion is set, or the Settings / e2e bridge
 * dataset override is armed. Canvas code must use this (not matchMedia alone)
 * so `data-vk-reduced-motion` actually disables room fades and juice flashes.
 */
export function prefersReducedMotion(): boolean {
  if (typeof document !== 'undefined') {
    const html = document.documentElement;
    if (
      html.dataset.vkReducedMotion === 'true' ||
      html.getAttribute('data-vk-reduced-motion') === 'true'
    ) {
      return true;
    }
    const root = document.querySelector('#game-root');
    if (root?.getAttribute('data-vk-reduced-motion') === 'true') {
      return true;
    }
  }
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
