import type { GameStore, ScreenId } from '../game-store.ts';

export const NAV_SCREENS: ScreenId[] = [
  'restaurant',
  'recipes',
];

export function selectCurrentScreen(state: GameStore): ScreenId {
  return state.screen;
}

export function selectNavigationLocked(state: GameStore): boolean {
  return Boolean(state.activeDay);
}

export function selectCanNavigateTo(state: GameStore, target: ScreenId): boolean {
  if (target === state.screen) return true;
  // Settings remains reachable from the status-bar gear during service. All
  // gameplay/meta destinations stay locked so an active floor cannot be
  // abandoned accidentally.
  if (state.activeDay && target !== 'restaurant' && target !== 'settings') return false;
  return true;
}

export function navigationLockReason(state: GameStore): string | null {
  if (!state.activeDay) return null;
  return 'Finish or close the service day before leaving the restaurant.';
}

/**
 * Persistent lock banner is only useful when the bottom nav is actually on screen.
 * Mid-service on the restaurant floor the nav is hidden — pinning the copy there
 * covers guest cards / Seat guest and never dismisses.
 */
export function shouldShowNavigationLockHint(state: GameStore): boolean {
  if (!state.activeDay) return false;
  const navHidden =
    Boolean(state.activeDay) && !state.daySummary && state.screen === 'restaurant';
  return !navHidden;
}
