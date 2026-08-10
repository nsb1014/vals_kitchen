import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../domain/state/game-state.ts';
import { customersPerDay } from '../domain/day/types.ts';
import { pickModifier } from '../domain/day/modifiers.ts';
import { daySeed } from '../domain/rng/index.ts';
import {
  achievementProgressView,
  findNearestAchievement,
  formatNearestAchievementLine,
} from '../domain/achievements/nearest.ts';
import {
  buildTomorrowPreview,
} from '../ui/presentation/day-summary-display.ts';
import { buildRatingDisplayModel } from '../ui/presentation/rating-display.ts';
import { masteryProgressRatio } from '../ui/presentation/recipe-book.ts';
import { testContext } from './test-helpers.ts';

describe('meta tomorrow panel + achievement appeal helpers', () => {
  it('formats tomorrow preview with customers, modifier, prestige, and goal', () => {
    const state = createNewGameState(3);
    state.rating = 3.4;
    state.prestige = 0;
    state.day = 2;
    const nextDay = 2;
    const expected = customersPerDay({
      seatingCapacity: state.seatingCapacity,
      rating: state.rating,
      prestige: state.prestige,
      day: nextDay,
    });
    const modifier = pickModifier(
      nextDay,
      testContext.modifiers,
      daySeed(state.globalRunSeed, nextDay, state.prestige),
    );
    const preview = buildTomorrowPreview({
      nextDay,
      expectedCustomers: expected,
      seatingCapacity: state.seatingCapacity,
      modifierName: modifier.name,
      modifierDescription: modifier.description,
      prestigeDistanceText: buildRatingDisplayModel(state.rating, state.prestige)
        .prestigeDistanceText,
      nearestAchievementLine: formatNearestAchievementLine(
        findNearestAchievement(state),
      ),
    });
    expect(preview.title).toBe('Tomorrow — Day 2');
    expect(preview.customersLine).toMatch(/Expected guests: \d+/);
    expect(preview.modifierLine).toContain(modifier.name);
    expect(preview.prestigeLine).toContain('prestige');
    expect(preview.achievementLine).toMatch(/Closest goal:/);
  });

  it('marks near-complete achievements at ≥80% progress', () => {
    const state = createNewGameState(9);
    state.discoveredRecipeIds = Array.from({ length: 4 }, (_, i) => `r${i}`);
    const view = achievementProgressView(state, {
      id: 'recipe-unlocks-5',
      family: 'recipe-unlocks',
      threshold: 5,
      title: 'Recipe Rookie',
      description: 'Discover 5 named recipes.',
    });
    expect(view.ratio).toBeCloseTo(0.8);
    expect(view.nearComplete).toBe(true);
    expect(findNearestAchievement(state)?.achievement.id).toBe('recipe-unlocks-5');
  });

  it('computes mastery micro-bar ratios without changing mastery rules', () => {
    expect(masteryProgressRatio({ level: 3, progress: 1 })).toBeCloseTo(0.25);
    expect(masteryProgressRatio({ level: 10, progress: 0 })).toBe(1);
  });
});
