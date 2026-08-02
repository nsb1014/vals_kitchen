import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_CATALOG,
  type AchievementId,
} from '../domain/achievements/catalog.ts';
import { evaluateAchievements } from '../domain/achievements/evaluate.ts';
import { gameReducer } from '../domain/reducer.ts';
import { createNewGameState, normalizeGameState } from '../domain/state/game-state.ts';
import { migrateSave } from '../persistence/saveCode.ts';
import { computeChecksum } from '../persistence/serialize.ts';
import { mapReducerEventsToUi } from '../store/service-events.ts';
import { testContext } from './test-helpers.ts';

function evaluatedIds(
  mutate: (state: ReturnType<typeof createNewGameState>) => void,
): AchievementId[] {
  const state = createNewGameState(42);
  mutate(state);
  return evaluateAchievements(state).map((achievement) => achievement.id);
}

describe('achievement catalog', () => {
  it('contains every starter milestone with stable family-threshold ids', () => {
    expect(ACHIEVEMENT_CATALOG.map((achievement) => achievement.id)).toEqual([
      'recipe-unlocks-1',
      'recipe-unlocks-5',
      'recipe-unlocks-10',
      'recipe-unlocks-25',
      'recipe-unlocks-50',
      'recipe-unlocks-100',
      'recipe-mastery-5-1',
      'recipe-mastery-5-5',
      'recipe-mastery-5-10',
      'recipe-mastery-10-1',
      'recipe-mastery-10-3',
      'recipe-mastery-10-5',
      'decor-1',
      'decor-3',
      'decor-6',
      'tables-3',
      'tables-5',
      'tables-8',
      'days-1',
      'days-7',
      'days-14',
      'days-30',
      'prestiges-1',
      'prestiges-3',
      'prestiges-5',
    ]);
  });
});

describe('evaluateAchievements thresholds', () => {
  it.each([1, 5, 10, 25, 50, 100])(
    'unlocks the %i discovered recipe milestone at its exact threshold',
    (threshold) => {
      const below = evaluatedIds((state) => {
        state.discoveredRecipeIds = Array.from(
          { length: threshold - 1 },
          (_, index) => `recipe-${index}`,
        );
      });
      const at = evaluatedIds((state) => {
        state.discoveredRecipeIds = Array.from(
          { length: threshold },
          (_, index) => `recipe-${index}`,
        );
      });

      expect(below).not.toContain(`recipe-unlocks-${threshold}`);
      expect(at).toContain(`recipe-unlocks-${threshold}`);
    },
  );

  it.each([1, 5, 10])(
    'unlocks the %i recipes at mastery 5 milestone at its exact threshold',
    (threshold) => {
      const below = evaluatedIds((state) => {
        state.recipeMastery = Object.fromEntries(
          Array.from({ length: threshold - 1 }, (_, index) => [
            `recipe-${index}`,
            { level: 5, progress: 0 },
          ]),
        );
      });
      const at = evaluatedIds((state) => {
        state.recipeMastery = Object.fromEntries(
          Array.from({ length: threshold }, (_, index) => [
            `recipe-${index}`,
            { level: 5, progress: 0 },
          ]),
        );
      });

      expect(below).not.toContain(`recipe-mastery-5-${threshold}`);
      expect(at).toContain(`recipe-mastery-5-${threshold}`);
    },
  );

  it.each([1, 3, 5])(
    'unlocks the %i recipes at mastery 10 milestone at its exact threshold',
    (threshold) => {
      const below = evaluatedIds((state) => {
        state.recipeMastery = Object.fromEntries(
          Array.from({ length: threshold - 1 }, (_, index) => [
            `recipe-${index}`,
            { level: 10, progress: 0 },
          ]),
        );
      });
      const at = evaluatedIds((state) => {
        state.recipeMastery = Object.fromEntries(
          Array.from({ length: threshold }, (_, index) => [
            `recipe-${index}`,
            { level: 10, progress: 0 },
          ]),
        );
      });

      expect(below).not.toContain(`recipe-mastery-10-${threshold}`);
      expect(at).toContain(`recipe-mastery-10-${threshold}`);
    },
  );

  it.each([1, 3, 6])(
    'unlocks the %i decorations purchased milestone from summed counts',
    (threshold) => {
      const below = evaluatedIds((state) => {
        state.decorPurchasedCounts.decor_plant = Math.max(0, threshold - 1);
      });
      const at = evaluatedIds((state) => {
        state.decorPurchasedCounts.decor_plant = Math.max(0, threshold - 1);
        state.decorPurchasedCounts.decor_flowers = 1;
      });

      expect(below).not.toContain(`decor-${threshold}`);
      expect(at).toContain(`decor-${threshold}`);
    },
  );

  it.each([3, 5, 8])(
    'unlocks the %i tables owned milestone from tableCount',
    (threshold) => {
      const below = evaluatedIds((state) => {
        state.tableCount = threshold - 1;
      });
      const at = evaluatedIds((state) => {
        state.tableCount = threshold;
      });

      expect(below).not.toContain(`tables-${threshold}`);
      expect(at).toContain(`tables-${threshold}`);
    },
  );

  it.each([1, 7, 14, 30])(
    'unlocks the %i completed days milestone only after close-day increment',
    (threshold) => {
      const below = evaluatedIds((state) => {
        state.day = threshold;
      });
      const at = evaluatedIds((state) => {
        state.day = threshold + 1;
      });

      expect(below).not.toContain(`days-${threshold}`);
      expect(at).toContain(`days-${threshold}`);
    },
  );

  it.each([1, 3, 5])(
    'unlocks the %i prestiges milestone at its exact threshold',
    (threshold) => {
      const below = evaluatedIds((state) => {
        state.prestige = threshold - 1;
        state.stats.prestigesTotal = threshold - 1;
      });
      const at = evaluatedIds((state) => {
        state.prestige = threshold;
        state.stats.prestigesTotal = threshold;
      });

      expect(below).not.toContain(`prestiges-${threshold}`);
      expect(at).toContain(`prestiges-${threshold}`);
    },
  );

  it('returns only newly unlocked achievements, making repeated evaluation idempotent', () => {
    const state = createNewGameState(7);
    state.tableCount = 5;

    const first = evaluateAchievements(state);
    state.unlockedAchievementIds.push(...first.map((achievement) => achievement.id));
    const second = evaluateAchievements(state);

    expect(first.map((achievement) => achievement.id)).toEqual([
      'tables-3',
      'tables-5',
    ]);
    expect(second).toEqual([]);
  });

  it('migrates v4 saves with an empty unlocked id list', () => {
    const legacy = createNewGameState(8);
    delete (legacy as unknown as { unlockedAchievementIds?: string[] })
      .unlockedAchievementIds;

    const migrated = migrateSave({
      saveVersion: 4,
      checksum: computeChecksum(legacy),
      createdAt: '2026-07-27T00:00:00.000Z',
      gameState: legacy,
    });

    expect(migrated.gameState.unlockedAchievementIds).toEqual([]);
    expect(normalizeGameState(migrated.gameState).unlockedAchievementIds).toEqual(
      [],
    );
  });
});

describe('achievement mutation integration', () => {
  it('persists and emits each purchase achievement only once', () => {
    const state = createNewGameState(9);
    state.cash = 10_000;

    const first = gameReducer(
      state,
      { type: 'PURCHASE', purchase: { type: 'table' } },
      testContext,
    );
    expect(first.state.unlockedAchievementIds).toContain('tables-3');
    expect(first.events).toContainEqual(
      expect.objectContaining({
        type: 'ACHIEVEMENT_UNLOCKED',
        achievementId: 'tables-3',
      }),
    );

    const second = gameReducer(
      first.state,
      { type: 'PURCHASE', purchase: { type: 'table' } },
      testContext,
    );
    expect(
      second.events.filter((event) => event.type === 'ACHIEVEMENT_UNLOCKED'),
    ).toEqual([]);
  });

  it('evaluates completed-day achievements after CLOSE_DAY', () => {
    const state = createNewGameState(10);
    state.activeDay = {
      seed: 10,
      modifierId: 'none',
      serviceStarted: true,
      customers: [],
      queueIndex: 0,
      dayEarnings: 0,
      dayMatchSum: 0,
      customersServed: 0,
    };

    const result = gameReducer(state, { type: 'CLOSE_DAY' }, testContext);

    expect(result.state.day).toBe(2);
    expect(result.state.unlockedAchievementIds).toContain('days-1');
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'ACHIEVEMENT_UNLOCKED',
        achievementId: 'days-1',
      }),
    );
  });

  it('maps achievement events to the shared celebration queue', () => {
    const patch = mapReducerEventsToUi(
      [
        {
          type: 'ACHIEVEMENT_UNLOCKED',
          achievementId: 'decor-1',
          title: 'A Personal Touch',
          body: 'Purchase your first decoration.',
        },
      ],
      createNewGameState(11),
    );

    expect(patch.celebrationQueue).toEqual([
      {
        kind: 'achievement',
        achievementId: 'decor-1',
        title: 'A Personal Touch',
        body: 'Purchase your first decoration.',
      },
    ]);
  });
});
