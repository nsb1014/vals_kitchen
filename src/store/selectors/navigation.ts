import type { GameStore, ScreenId } from '../game-store.ts';

export const NAV_SCREENS: ScreenId[] = [
  'restaurant',
  'shop',
  'inspector',
  'recipes',
  'rating',
  'settings',
];

export function selectCurrentScreen(state: GameStore): ScreenId {
  return state.screen;
}

export function selectNavigationLocked(state: GameStore): boolean {
  return Boolean(state.activeDay);
}

export function selectCanNavigateTo(state: GameStore, target: ScreenId): boolean {
  if (target === state.screen) return true;
  if (state.activeDay && target !== 'restaurant') return false;
  return true;
}

export function navigationLockReason(state: GameStore): string | null {
  if (!state.activeDay) return null;
  return 'Finish or close the service day before leaving the restaurant.';
}
