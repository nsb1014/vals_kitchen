import type { GameState } from '../state/game-state.ts';
import {
  ACHIEVEMENT_CATALOG,
  type AchievementDefinition,
} from './catalog.ts';
import { achievementProgress } from './evaluate.ts';

export interface AchievementProgressView {
  achievement: AchievementDefinition;
  progress: number;
  threshold: number;
  ratio: number;
  remaining: number;
  unlocked: boolean;
  nearComplete: boolean;
}

export const ACHIEVEMENT_NEAR_COMPLETE_RATIO = 0.8;

export function achievementProgressView(
  state: GameState,
  achievement: AchievementDefinition,
  unlockedIds: ReadonlySet<string> | readonly string[] = state.unlockedAchievementIds,
): AchievementProgressView {
  const unlocked = new Set(
    Array.isArray(unlockedIds) ? unlockedIds : [...unlockedIds],
  ).has(achievement.id);
  const raw = achievementProgress(state, achievement);
  const progress = Math.min(raw, achievement.threshold);
  const ratio =
    achievement.threshold <= 0
      ? 1
      : Math.min(1, Math.max(0, progress / achievement.threshold));
  return {
    achievement,
    progress,
    threshold: achievement.threshold,
    ratio,
    remaining: Math.max(0, achievement.threshold - progress),
    unlocked,
    nearComplete: !unlocked && ratio >= ACHIEVEMENT_NEAR_COMPLETE_RATIO,
  };
}

/** Closest locked achievement by remaining progress ratio (highest ratio wins). */
export function findNearestAchievement(
  state: GameState,
): AchievementProgressView | null {
  const unlocked = new Set(state.unlockedAchievementIds);
  let best: AchievementProgressView | null = null;
  for (const achievement of ACHIEVEMENT_CATALOG) {
    if (unlocked.has(achievement.id)) continue;
    const view = achievementProgressView(state, achievement, unlocked);
    // Already at threshold — unlock queue owns it; skip for "chase next" copy.
    if (view.ratio >= 1) continue;
    if (
      !best ||
      view.ratio > best.ratio ||
      (view.ratio === best.ratio && view.remaining < best.remaining)
    ) {
      best = view;
    }
  }
  return best;
}

export function formatNearestAchievementLine(
  view: AchievementProgressView | null,
): string | null {
  if (!view) return null;
  return `Closest goal: ${view.achievement.title} (${view.progress}/${view.threshold})`;
}
