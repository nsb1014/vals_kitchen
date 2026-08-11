/**
 * Bounded focus restoration after a modal/sheet closes.
 *
 * HUD chrome often rebuilds via innerHTML after a screen change; a single
 * focus() can land on a node that is replaced on the next store sync. Re-query
 * the live target each animation frame until it is connected and focused, or
 * until the budget expires.
 */

export function isUsableFocusTarget(
  target: HTMLElement | null,
): target is HTMLElement {
  if (
    !target?.isConnected ||
    target === document.body ||
    target === document.documentElement ||
    target.closest('[hidden], [inert], [aria-hidden="true"]')
  ) {
    return false;
  }
  const style = getComputedStyle(target);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

export type OpenerFocusRestoreOptions = {
  resolveTarget: () => HTMLElement | null;
  /**
   * When true for the current active element, leave focus where it is
   * (e.g. Recipes nav after leaving Settings for Recipes).
   */
  shouldDeferToActive?: (active: HTMLElement) => boolean;
  isUsable?: (target: HTMLElement | null) => target is HTMLElement;
  getActiveElement?: () => HTMLElement | null;
  focusElement?: (target: HTMLElement) => void;
  budgetMs?: number;
  requestAnimationFrame?: (callback: (time: number) => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
  now?: () => number;
};

function readActiveHtmlElement(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement ? active : null;
}

/**
 * Double-rAF, then poll up to `budgetMs` re-querying and focusing the opener.
 * Returns a cancel function for teardown.
 */
export function scheduleOpenerFocusRestore(
  options: OpenerFocusRestoreOptions,
): () => void {
  const isUsable = options.isUsable ?? isUsableFocusTarget;
  const getActiveElement = options.getActiveElement ?? readActiveHtmlElement;
  const focusElement =
    options.focusElement ??
    ((target: HTMLElement) => {
      target.focus({ preventScroll: true });
    });
  const budgetMs = options.budgetMs ?? 500;
  const raf =
    options.requestAnimationFrame ??
    ((cb: (time: number) => void) => requestAnimationFrame(cb));
  const cancelRaf =
    options.cancelAnimationFrame ??
    ((handle: number) => {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(handle);
      }
    });
  const now = options.now ?? (() => performance.now());
  let cancelled = false;
  let rafId = 0;

  const tick = (deadline: number) => {
    if (cancelled) return;

    const active = getActiveElement();

    if (
      active &&
      isUsable(active) &&
      options.shouldDeferToActive?.(active)
    ) {
      return;
    }

    const target = options.resolveTarget();
    if (target && isUsable(target) && getActiveElement() !== target) {
      focusElement(target);
    }

    // Keep asserting through the budget so a mid-window HUD rebuild that
    // replaces the opener can be refocused on the live replacement.
    if (now() < deadline) {
      rafId = raf(() => tick(deadline));
    }
  };

  rafId = raf(() => {
    rafId = raf(() => {
      tick(now() + budgetMs);
    });
  });

  return () => {
    cancelled = true;
    cancelRaf(rafId);
  };
}
