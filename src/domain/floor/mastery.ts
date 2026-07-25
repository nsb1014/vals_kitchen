/** Stars added per mastery level on a matched-recipe serve (PRD §5.5). */
export const MASTERY_BONUS_PER_LEVEL = 0.05;
export const MASTERY_MAX_LEVEL = 10;

export interface RecipeMasteryEntry {
  level: number;
  progress: number;
}

export type RecipeMasteryMap = Record<string, RecipeMasteryEntry>;

/** Serves required to advance from `level` to `level + 1` (L1→L2 needs 2, …, L9→L10 needs 10). */
export function servesToReachNext(level: number): number {
  if (level < 1 || level >= MASTERY_MAX_LEVEL) return 0;
  return level + 1;
}

export function masteryBonusStars(level: number): number {
  if (level < 1) return 0;
  return Math.min(level, MASTERY_MAX_LEVEL) * MASTERY_BONUS_PER_LEVEL;
}

/**
 * Apply one matched serve toward mastery.
 * Level 1 unlocks on first serve; further serves fill progress toward the next level.
 */
export function applyMasteryServe(
  mastery: RecipeMasteryMap,
  recipeId: string,
): { mastery: RecipeMasteryMap; level: number; leveledUp: boolean } {
  const next: RecipeMasteryMap = { ...mastery };
  const prev = next[recipeId];

  if (!prev) {
    next[recipeId] = { level: 1, progress: 0 };
    return { mastery: next, level: 1, leveledUp: true };
  }

  if (prev.level >= MASTERY_MAX_LEVEL) {
    return { mastery: next, level: prev.level, leveledUp: false };
  }

  const needed = servesToReachNext(prev.level);
  const progress = prev.progress + 1;
  if (progress >= needed) {
    const level = prev.level + 1;
    next[recipeId] = { level, progress: 0 };
    return { mastery: next, level, leveledUp: true };
  }

  next[recipeId] = { level: prev.level, progress };
  return { mastery: next, level: prev.level, leveledUp: false };
}
