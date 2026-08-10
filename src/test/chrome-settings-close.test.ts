import { beforeEach, describe, expect, it } from 'vitest';
import { createNewGameState } from '../domain/state/game-state.ts';
import { useGameStore } from '../store/game-store.ts';
import {
  getSettingsReturnScreen,
  resetSettingsReturnTracking,
  resolveSettingsReturnScreen,
  trackScreenChange,
} from '../app/screenRouter.ts';
import './test-helpers.ts';

describe('chrome settings close / return', () => {
  beforeEach(() => {
    resetSettingsReturnTracking('restaurant');
    useGameStore.setState({
      ...createNewGameState(3),
      screen: 'restaurant',
      hydrated: true,
      activeDay: null,
      daySummary: null,
    });
  });

  it('defaults return target to the restaurant floor', () => {
    expect(resolveSettingsReturnScreen(null)).toBe('restaurant');
    expect(resolveSettingsReturnScreen('settings')).toBe('restaurant');
    expect(getSettingsReturnScreen()).toBe('restaurant');
  });

  it('open settings → close → previous screen restored', () => {
    useGameStore.getState().navigateTo('recipes');
    trackScreenChange('recipes');
    expect(useGameStore.getState().screen).toBe('recipes');

    useGameStore.getState().navigateTo('settings');
    trackScreenChange('settings');
    expect(useGameStore.getState().screen).toBe('settings');
    expect(getSettingsReturnScreen()).toBe('recipes');

    const target = getSettingsReturnScreen();
    useGameStore.getState().navigateTo(target);
    trackScreenChange(target);
    expect(useGameStore.getState().screen).toBe('recipes');
  });

  it('restores restaurant when settings was opened from the floor', () => {
    trackScreenChange('restaurant');
    useGameStore.getState().navigateTo('settings');
    trackScreenChange('settings');
    expect(getSettingsReturnScreen()).toBe('restaurant');

    const target = getSettingsReturnScreen();
    useGameStore.getState().navigateTo(target);
    trackScreenChange(target);
    expect(useGameStore.getState().screen).toBe('restaurant');
  });

  it('keeps the frozen return screen across settings-only churn', () => {
    trackScreenChange('shop');
    trackScreenChange('settings');
    expect(getSettingsReturnScreen()).toBe('shop');
    trackScreenChange('settings');
    expect(getSettingsReturnScreen()).toBe('shop');
  });
});
