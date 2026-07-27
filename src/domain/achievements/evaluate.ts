import { decorPurchasedTotal } from '../economy/decor.ts';
import type { GameState } from '../state/game-state.ts';
import {
  ACHIEVEMENT_CATALOG,
  type AchievementDefinition,
} from './catalog.ts';

export function achievementProgress(
  state: GameState,
  achievement: AchievementDefinition,
): number {
  switch (achievement.family) {
    case 'recipe-unlocks':
      return new Set(state.discoveredRecipeIds).size;
    case 'recipe-mastery-5':
      return Object.values(state.recipeMastery).filter((entry) => entry.level >= 5)
        .length;
    case 'recipe-mastery-10':
      return Object.values(state.recipeMastery).filter((entry) => entry.level >= 10)
        .length;
    case 'decor':
      return decorPurchasedTotal(state.decorPurchasedCounts);
    case 'tables':
      return state.tableCount;
    case 'days':
      // `day` is the next/current service-day number and increments only on CLOSE_DAY.
      return Math.max(0, state.day - 1);
    case 'prestiges':
      return Math.max(state.prestige, state.stats.prestigesTotal);
  }
}

/** Return reached catalog entries not already persisted in the save. */
export function evaluateAchievements(state: GameState): AchievementDefinition[] {
  const unlocked = new Set(state.unlockedAchievementIds);
  return ACHIEVEMENT_CATALOG.filter(
    (achievement) =>
      !unlocked.has(achievement.id) &&
      achievementProgress(state, achievement) >= achievement.threshold,
  );
}

export function applyAchievementUnlocks(state: GameState): {
  state: GameState;
  unlocked: AchievementDefinition[];
} {
  const unlocked = evaluateAchievements(state);
  if (unlocked.length === 0) return { state, unlocked };
  return {
    state: {
      ...state,
      unlockedAchievementIds: [
        ...state.unlockedAchievementIds,
        ...unlocked.map((achievement) => achievement.id),
      ],
    },
    unlocked,
  };
}
