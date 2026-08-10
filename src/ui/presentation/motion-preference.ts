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
