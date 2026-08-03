export const NOTIFICATION_BLOCKING_SURFACE_CHANGE =
  'notification-blocking-surface-change';

/** UI-local surfaces that must not be obscured by the global notice banner. */
export function hasLocalNotificationBlockingSurface(
  doc: Document = document,
): boolean {
  const selector =
    '#floor-tickets-menu, #layout-catalog-sheet, .chat-bubble.order-bubble';
  const candidates = doc.querySelectorAll?.(selector);
  if (!candidates) {
    // Keep the helper usable by narrow DOM test doubles.
    return Boolean(doc.querySelector(selector));
  }

  return Array.from(candidates).some((candidate) => {
    for (
      let current: Element | null = candidate;
      current;
      current = current.parentElement
    ) {
      if (
        current.hasAttribute('hidden') ||
        current.hasAttribute('inert') ||
        current.getAttribute('aria-hidden') === 'true'
      ) {
        return false;
      }

      try {
        const style = doc.defaultView?.getComputedStyle(current);
        if (
          style?.display === 'none' ||
          style?.visibility === 'hidden' ||
          style?.visibility === 'collapse'
        ) {
          return false;
        }
      } catch {
        // Lightweight DOM implementations may not provide computed styles.
      }
    }
    return true;
  });
}

export function notifyNotificationBlockingSurfaceChanged(
  target: Window = window,
): void {
  target.dispatchEvent(new Event(NOTIFICATION_BLOCKING_SURFACE_CHANGE));
}
