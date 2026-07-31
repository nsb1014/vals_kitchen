import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGameState } from '../domain/state/game-state.ts';
import { getGameStateSnapshot, useGameStore } from '../store/game-store.ts';
import { mapReducerEventsToUi } from '../store/service-events.ts';
import './test-helpers.ts';

const served = {
  type: 'CUSTOMER_SERVED' as const,
  matchStars: 9,
  tip: 42,
  ratingDelta: 0.1,
  recipeId: 'herb-pasta',
  recipeName: 'Herb Pasta',
  ingredientIds: ['pasta', 'basil', 'butter'],
};

describe('recipe celebration mapping', () => {
  it('emits one combined banner for discovery and mastery level 1', () => {
    const patch = mapReducerEventsToUi(
      [
        {
          type: 'RECIPE_DISCOVERED',
          recipeId: served.recipeId,
          recipeName: served.recipeName,
          ingredientIds: served.ingredientIds,
        },
        { ...served, masteryLevel: 1, masteryLeveledUp: true },
      ],
      createNewGameState(1),
    );

    expect(patch.celebrationQueue).toEqual([
      {
        kind: 'recipe',
        title: 'Herb Pasta',
        body: 'New recipe unlocked · Mastery Lv.1',
        ingredientIds: ['pasta', 'basil', 'butter'],
        level: 1,
      },
    ]);
  });

  it('emits a separate mastery banner for level 2 and later', () => {
    const patch = mapReducerEventsToUi(
      [{ ...served, masteryLevel: 2, masteryLeveledUp: true }],
      createNewGameState(2),
    );

    expect(patch.celebrationQueue).toEqual([
      {
        kind: 'mastery',
        title: 'Herb Pasta',
        body: 'Mastery up! Lv.2',
        ingredientIds: ['pasta', 'basil', 'butter'],
        level: 2,
      },
    ]);
  });
});

describe('celebration queue timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({
      noticeActive: null,
      noticeSticky: null,
      notificationSurfaceActive: true,
      celebrationQueue: [],
    });
  });

  afterEach(() => {
    useGameStore.getState().clearCelebrations();
    vi.useRealTimers();
  });

  it('shows one FIFO item at a time for four seconds each', () => {
    const first = { kind: 'recipe' as const, title: 'First', body: 'Unlocked' };
    const second = {
      kind: 'achievement' as const,
      title: 'Second',
      body: 'Milestone',
    };

    useGameStore.getState().enqueueCelebration(first);
    useGameStore.getState().enqueueCelebration(second);
    expect(useGameStore.getState().celebrationQueue).toEqual([first, second]);

    vi.advanceTimersByTime(3_999);
    expect(useGameStore.getState().celebrationQueue[0]).toEqual(first);

    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().celebrationQueue).toEqual([second]);

    vi.advanceTimersByTime(4_000);
    expect(useGameStore.getState().celebrationQueue).toEqual([]);
  });

  it('keeps celebrations out of save snapshots', () => {
    useGameStore.getState().enqueueCelebration({
      kind: 'achievement',
      title: 'Regular',
      body: 'Complete seven service days',
      achievementId: 'days-7',
    });

    const snapshot = getGameStateSnapshot() as unknown as Record<
      string,
      unknown
    >;
    expect(snapshot.celebrationQueue).toBeUndefined();
  });

  it('gives the next item a full dwell after manual dismissal', () => {
    const first = { kind: 'recipe' as const, title: 'First', body: 'Unlocked' };
    const second = {
      kind: 'achievement' as const,
      title: 'Second',
      body: 'Milestone',
    };
    useGameStore.getState().enqueueCelebration(first);
    useGameStore.getState().enqueueCelebration(second);
    vi.advanceTimersByTime(1000);

    useGameStore.getState().dismissCelebration();
    vi.advanceTimersByTime(3999);
    expect(useGameStore.getState().celebrationQueue).toEqual([second]);

    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().celebrationQueue).toEqual([]);
  });

  it('preserves a CLOSE_DAY achievement while clearing stale celebrations', async () => {
    const game = createNewGameState(10);
    game.activeDay = {
      seed: 10,
      modifierId: 'none',
      customers: [],
      queueIndex: 0,
      dayEarnings: 0,
      dayMatchSum: 0,
      customersServed: 0,
    };
    useGameStore.setState({
      ...game,
      celebrationQueue: [
        { kind: 'recipe', title: 'Stale', body: 'From before close' },
      ],
      dayStartRating: game.rating,
    });

    await useGameStore.getState().dispatch({ type: 'CLOSE_DAY' });

    expect(useGameStore.getState().celebrationQueue).toEqual([
      expect.objectContaining({
        kind: 'achievement',
        achievementId: 'days-1',
      }),
    ]);
  });
});
