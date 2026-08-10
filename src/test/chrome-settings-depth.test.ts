import { beforeEach, describe, expect, it } from 'vitest';
import { createNewGameState } from '../domain/state/game-state.ts';
import { useGameStore } from '../store/game-store.ts';
import { nextTutorialStep, tutorialPrompt } from '../domain/floor/tutorial.ts';
import './test-helpers.ts';

describe('chrome settings depth controls', () => {
  beforeEach(() => {
    useGameStore.setState({
      ...createNewGameState(9),
      screen: 'settings',
      hydrated: true,
      audioEnabled: true,
      musicEnabled: false,
      audioVolume: 1,
      reducedMotion: false,
      tutorialDismissedStepId: 'set_tables',
      activeDay: null,
      daySummary: null,
    });
  });

  it('clamps master volume into 0–1', () => {
    useGameStore.getState().setAudioVolume(0.4);
    expect(useGameStore.getState().audioVolume).toBe(0.4);
    useGameStore.getState().setAudioVolume(2);
    expect(useGameStore.getState().audioVolume).toBe(1);
    useGameStore.getState().setAudioVolume(-1);
    expect(useGameStore.getState().audioVolume).toBe(0);
  });

  it('toggles reduced motion preference', () => {
    useGameStore.getState().setReducedMotion(true);
    expect(useGameStore.getState().reducedMotion).toBe(true);
    useGameStore.getState().setReducedMotion(false);
    expect(useGameStore.getState().reducedMotion).toBe(false);
  });

  it('replay tutorial clears dismiss and uses tutorial public API copy', () => {
    expect(tutorialPrompt('set_tables')).toMatch(/Set every table/i);
    expect(nextTutorialStep).toEqual(expect.any(Function));
    useGameStore.getState().replayTutorial();
    expect(useGameStore.getState().tutorialDismissedStepId).toBeNull();
  });
});
