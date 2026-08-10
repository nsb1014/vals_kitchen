/**
 * Keyboard operability for the floor service action strip.
 * Uses a single toolbar tab stop + aria-activedescendant so disabled actions
 * remain discoverable (native `disabled` removes buttons from tab order).
 */

const ACTION_SELECTOR = '.floor-actions .service-btn';

export interface FloorActionKeyboardTarget {
  id: string;
  disabled?: boolean;
  hidden?: boolean;
  className?: string;
  getAttribute?: (name: string) => string | null;
}

export function floorActionButtons(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    root.querySelectorAll<HTMLButtonElement>(ACTION_SELECTOR),
  ).filter(
    (button) => !button.hidden && button.getAttribute('aria-hidden') !== 'true',
  );
}

export function isFloorActionAvailable(
  button: FloorActionKeyboardTarget,
): boolean {
  const ariaDisabled = button.getAttribute?.('aria-disabled');
  return !button.disabled && ariaDisabled !== 'true' && !button.hidden;
}

/** Prefer the emphasized (tutorial) action, else the first available, else first. */
export function pickInitialFloorActionIndex(
  buttons: FloorActionKeyboardTarget[],
): number {
  const primary = buttons.findIndex(
    (button) =>
      Boolean(button.className?.split(/\s+/).includes('primary')) &&
      isFloorActionAvailable(button),
  );
  if (primary >= 0) return primary;
  const available = buttons.findIndex(isFloorActionAvailable);
  return available >= 0 ? available : 0;
}

export function nextFloorActionIndex(
  buttons: FloorActionKeyboardTarget[],
  current: number,
  delta: number,
): number {
  if (buttons.length === 0) return 0;
  return (current + delta + buttons.length) % buttons.length;
}

export function bindFloorActionsToolbar(panel: HTMLElement): () => void {
  const actions = panel.querySelector<HTMLElement>('.floor-actions');
  if (!actions) return () => undefined;

  actions.setAttribute('role', 'toolbar');
  actions.setAttribute('aria-label', 'Floor service actions');
  actions.tabIndex = 0;

  const buttons = floorActionButtons(actions);
  if (buttons.length === 0) {
    actions.removeAttribute('tabindex');
    return () => undefined;
  }

  for (const button of buttons) {
    button.tabIndex = -1;
  }

  let activeIndex = pickInitialFloorActionIndex(buttons);

  const syncActive = () => {
    const active = buttons[activeIndex] ?? buttons[0]!;
    activeIndex = Math.max(0, buttons.indexOf(active));
    actions.setAttribute('aria-activedescendant', active.id);
    for (const button of buttons) {
      button.classList.toggle('floor-action-keyboard-active', button === active);
    }
  };

  const move = (delta: number) => {
    activeIndex = nextFloorActionIndex(buttons, activeIndex, delta);
    syncActive();
  };

  const activate = () => {
    const active = buttons[activeIndex];
    if (!active || !isFloorActionAvailable(active)) return;
    active.click();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      activeIndex = 0;
      syncActive();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      activeIndex = buttons.length - 1;
      syncActive();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  };

  const onFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const index = buttons.indexOf(target);
    if (index < 0) return;
    activeIndex = index;
    syncActive();
  };

  actions.addEventListener('keydown', onKeyDown);
  actions.addEventListener('focusin', onFocusIn);
  syncActive();

  return () => {
    actions.removeEventListener('keydown', onKeyDown);
    actions.removeEventListener('focusin', onFocusIn);
  };
}
