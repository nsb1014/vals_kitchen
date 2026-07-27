export type AchievementFamily =
  | 'recipe-unlocks'
  | 'recipe-mastery-5'
  | 'recipe-mastery-10'
  | 'decor'
  | 'tables'
  | 'days'
  | 'prestiges';

export type AchievementId =
  | `recipe-unlocks-${1 | 5 | 10 | 25 | 50 | 100}`
  | `recipe-mastery-5-${1 | 5 | 10}`
  | `recipe-mastery-10-${1 | 3 | 5}`
  | `decor-${1 | 3 | 6}`
  | `tables-${3 | 5 | 8}`
  | `days-${1 | 7 | 14 | 30}`
  | `prestiges-${1 | 3 | 5}`;

export interface AchievementDefinition {
  id: AchievementId;
  family: AchievementFamily;
  threshold: number;
  title: string;
  description: string;
}

function family(
  name: AchievementFamily,
  entries: ReadonlyArray<readonly [number, string, string]>,
): AchievementDefinition[] {
  return entries.map(([threshold, title, description]) => ({
    id: `${name}-${threshold}` as AchievementId,
    family: name,
    threshold,
    title,
    description,
  }));
}

export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
  ...family('recipe-unlocks', [
    [1, 'First on the Menu', 'Discover your first named recipe.'],
    [5, 'Recipe Rookie', 'Discover 5 named recipes.'],
    [10, 'Diner Notebook', 'Discover 10 named recipes.'],
    [25, 'Kitchen Collector', 'Discover 25 named recipes.'],
    [50, 'Well-Worn Cookbook', 'Discover 50 named recipes.'],
    [100, 'Recipe Archivist', 'Discover 100 named recipes.'],
  ]),
  ...family('recipe-mastery-5', [
    [1, 'House Favorite', 'Raise 1 recipe to mastery level 5.'],
    [5, 'Seasoned Cook', 'Raise 5 recipes to mastery level 5.'],
    [10, 'Diner Virtuoso', 'Raise 10 recipes to mastery level 5.'],
  ]),
  ...family('recipe-mastery-10', [
    [1, 'Perfected Plate', 'Raise 1 recipe to mastery level 10.'],
    [3, 'Signature Trio', 'Raise 3 recipes to mastery level 10.'],
    [5, 'Master Chef', 'Raise 5 recipes to mastery level 10.'],
  ]),
  ...family('decor', [
    [1, 'A Personal Touch', 'Purchase your first decoration.'],
    [3, 'Cozy Corners', 'Purchase 3 decorations.'],
    [6, 'Diner Darling', 'Purchase 6 decorations.'],
  ]),
  ...family('tables', [
    [3, 'Room for More', 'Own 3 tables.'],
    [5, 'Full House', 'Own 5 tables.'],
    [8, 'Grand Dining Room', 'Own 8 tables.'],
  ]),
  ...family('days', [
    [1, 'First Closing', 'Complete your first service day.'],
    [7, 'One Week Wonder', 'Complete 7 service days.'],
    [14, 'Diner Regular', 'Complete 14 service days.'],
    [30, 'Local Institution', 'Complete 30 service days.'],
  ]),
  ...family('prestiges', [
    [1, 'Rising Star', 'Earn your first prestige.'],
    [3, 'Three-Star Legacy', 'Earn 3 prestiges.'],
    [5, 'Diner Legend', 'Earn 5 prestiges.'],
  ]),
];

const ACHIEVEMENT_BY_ID = new Map(
  ACHIEVEMENT_CATALOG.map((achievement) => [achievement.id, achievement]),
);

export function getAchievement(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_BY_ID.get(id as AchievementId);
}

export function achievementBadgeUrl(id: AchievementId): string {
  return `/assets/achievements/${id}.png`;
}
