import { beforeEach, describe, expect, it } from 'vitest';
import { createNewGameState } from '../domain/state/game-state.ts';
import { useGameStore } from '../store/game-store.ts';
import { MORE_HUB_SCREENS } from '../ui/screens/NavigationBar.ts';
import { MOUNTED_META_SCREENS } from '../app/screenRouter.ts';
import { selectCanNavigateTo } from '../store/selectors/navigation.ts';
import './test-helpers.ts';

describe('chrome more navigation hub', () => {
  beforeEach(() => {
    useGameStore.setState({
      ...createNewGameState(9),
      screen: 'restaurant',
      hydrated: true,
      activeDay: null,
      daySummary: null,
    });
  });

  it('lists Shop, Rating, and Settings in the More hub', () => {
    expect(MORE_HUB_SCREENS).toEqual(['shop', 'rating', 'settings']);
    expect(MOUNTED_META_SCREENS).toEqual(
      expect.arrayContaining(['shop', 'rating', 'settings', 'recipes']),
    );
  });

  it('allows Shop and Rating navigation outside an active service day', () => {
    const state = useGameStore.getState();
    expect(selectCanNavigateTo(state, 'shop')).toBe(true);
    expect(selectCanNavigateTo(state, 'rating')).toBe(true);
    state.navigateTo('shop');
    expect(useGameStore.getState().screen).toBe('shop');
    useGameStore.getState().navigateTo('rating');
    expect(useGameStore.getState().screen).toBe('rating');
  });
});
