export const NOTIFICATION_BLOCKING_SURFACE_CHANGE =
  'notification-blocking-surface-change';

/** UI-local surfaces that must not be obscured by the global notice banner. */
export function hasLocalNotificationBlockingSurface(
  doc: Document = document,
): boolean {
  return Boolean(
    doc.querySelector(
      '#floor-tickets-menu:not([hidden]), #layout-catalog-sheet:not([hidden])',
    ),
  );
}

export function notifyNotificationBlockingSurfaceChanged(
  target: Window = window,
): void {
  target.dispatchEvent(new Event(NOTIFICATION_BLOCKING_SURFACE_CHANGE));
}
