export type AxisKey =
  | 'SW'
  | 'SA'
  | 'SO'
  | 'BI'
  | 'UM'
  | 'HE'
  | 'FR'
  | 'EA'
  | 'SM'
  | 'PU'
  | 'NU'
  | 'RI'
  | 'LI'
  | 'HT'
  | 'CR';

export type FlavorVector = Record<AxisKey, number> & { TE: -1 | 0 | 1 };

export interface Ingredient {
  id: string;
  name: string;
  category: string;
  equipmentId: string;
  flavor: FlavorVector;
  compoundIds: string[];
  purchaseIndex: number;
  newGameStarter?: boolean;
  softResetStarter?: boolean;
}

export interface Equipment {
  id: string;
  name: string;
  ingredientGroupName: string;
  purchaseIndex: number | null;
  cost: number;
}

export interface Recipe {
  id: string;
  name: string;
  cuisineTag: string;
  ingredientIds: string[];
  description: string;
}

export type Band = 'low' | 'mid' | 'high';

export interface CustomerPreference {
  primary: Partial<Record<AxisKey, Band>>;
  avoid: Partial<Record<AxisKey, boolean>>;
  phrases: string[];
  /**
   * Optimal dish flavor vector for this request — the aggregate of a witness
   * 3–6 combo from the player's unlocked pantry (always achievable).
   * Optional only for older mid-day saves; new generation always sets it.
   */
  idealProfile?: FlavorVector;
}

export interface Archetype {
  id: string;
  name: string;
  primaryAxisWeights: Partial<Record<AxisKey, number>>;
  avoidProbability: number;
}

export interface ContentBundle {
  ingredients: Ingredient[];
  equipment: Equipment[];
  recipes: Recipe[];
  archetypes: Archetype[];
  compoundAffinity: Record<string, Record<string, number>>;
}

export const AXIS_KEYS: AxisKey[] = [
  'SW',
  'SA',
  'SO',
  'BI',
  'UM',
  'HE',
  'FR',
  'EA',
  'SM',
  'PU',
  'NU',
  'RI',
  'LI',
  'HT',
  'CR',
];

export const EQUIPMENT_IDS = [
  'prep_station',
  'grill',
  'oven',
  'fryer',
  'stockpot',
  'cold_station',
  'pastry_bench',
  'smoker',
  'wok',
  'fermentation_crock',
  'barista_station',
  'spice_rack',
] as const;

export type EquipmentId = (typeof EQUIPMENT_IDS)[number];

export const NEW_GAME_STARTER_IDS = [
  'flour',
  'salt',
  'butter',
  'onion',
  'chicken',
  'garlic',
  'olive_oil',
  'rice',
  'egg',
] as const;

export const SOFT_RESET_STARTER_IDS = [
  'flour',
  'salt',
  'butter',
  'onion',
  'chicken',
] as const;

export const STARTING_EQUIPMENT_IDS = ['prep_station'] as const;
