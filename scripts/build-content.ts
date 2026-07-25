import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIngredientList } from './ingredient-definitions.ts';
import {
  buildCompoundAffinity,
  buildEquipmentDefinitions,
} from '../src/domain/content/validate-content.ts';
import type { Archetype, Recipe } from '../src/domain/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../src/data');
const publicDataDir = path.resolve(__dirname, '../public/data');

interface CuisineTemplate {
  tag: string;
  adjectives: string[];
  forms: string[];
  targetAxes: Partial<Record<string, { min: number; max: number }>>;
  preferredEquipment: string[];
}

const ARCHETYPES: Archetype[] = [
  { id: 'comfort_seeker', name: 'Comfort Seeker', primaryAxisWeights: { UM: 3, RI: 2, SA: 1 }, avoidProbability: 0.1 },
  { id: 'bright_palate', name: 'Bright Palate', primaryAxisWeights: { SO: 3, LI: 2, FR: 1 }, avoidProbability: 0.15 },
  { id: 'heat_lover', name: 'Heat Lover', primaryAxisWeights: { HT: 3, PU: 2, SM: 1 }, avoidProbability: 0.05 },
  { id: 'herbalist', name: 'Herbalist', primaryAxisWeights: { HE: 3, LI: 2, EA: 1 }, avoidProbability: 0.1 },
  { id: 'smoke_fan', name: 'Smoke Fan', primaryAxisWeights: { SM: 3, UM: 2, RI: 1 }, avoidProbability: 0.1 },
  { id: 'sweet_tooth', name: 'Sweet Tooth', primaryAxisWeights: { SW: 3, FR: 2, NU: 1 }, avoidProbability: 0.2 },
  { id: 'umami_hunter', name: 'Umami Hunter', primaryAxisWeights: { UM: 4, SA: 1, PU: 1 }, avoidProbability: 0.05 },
  { id: 'light_eater', name: 'Light Eater', primaryAxisWeights: { LI: 3, HE: 2, SO: 1 }, avoidProbability: 0.25 },
  { id: 'rich_indulger', name: 'Rich Indulger', primaryAxisWeights: { RI: 4, UM: 2, NU: 1 }, avoidProbability: 0.1 },
  { id: 'crunch_seeker', name: 'Crunch Seeker', primaryAxisWeights: { CR: 3, HT: 1, SA: 1 }, avoidProbability: 0.1 },
  { id: 'earthy_explorer', name: 'Earthy Explorer', primaryAxisWeights: { EA: 3, UM: 2, HE: 1 }, avoidProbability: 0.1 },
  { id: 'nutty_notes', name: 'Nutty Notes', primaryAxisWeights: { NU: 3, RI: 1, SW: 1 }, avoidProbability: 0.1 },
  { id: 'tang_master', name: 'Tang Master', primaryAxisWeights: { SO: 4, LI: 2, FR: 1 }, avoidProbability: 0.15 },
  { id: 'garlic_fan', name: 'Garlic Fan', primaryAxisWeights: { PU: 4, UM: 2, RI: 1 }, avoidProbability: 0.05 },
  { id: 'balanced_diner', name: 'Balanced Diner', primaryAxisWeights: { UM: 2, SO: 2, LI: 2, SA: 1 }, avoidProbability: 0.1 },
  { id: 'fruit_forward', name: 'Fruit Forward', primaryAxisWeights: { FR: 3, SW: 2, SO: 1 }, avoidProbability: 0.15 },
  { id: 'pepper_head', name: 'Pepper Head', primaryAxisWeights: { HT: 4, PU: 2, SM: 1 }, avoidProbability: 0.05 },
  { id: 'broth_soul', name: 'Broth Soul', primaryAxisWeights: { UM: 3, SA: 2, LI: 1 }, avoidProbability: 0.1 },
  { id: 'fresh_crunch', name: 'Fresh Crunch', primaryAxisWeights: { CR: 3, LI: 2, HE: 2 }, avoidProbability: 0.15 },
  { id: 'adventurous_eater', name: 'Adventurous Eater', primaryAxisWeights: { SM: 2, HT: 2, EA: 2, SO: 1 }, avoidProbability: 0.1 },
];

const MODIFIERS = [
  { id: 'trend_smoky', name: 'Smoky Trend', description: 'Smoky dishes earn +10% tips today.', effect: { type: 'tip_axis_bonus', axis: 'SM', multiplier: 1.1 } },
  { id: 'critic_visit', name: 'Food Critic', description: 'Serve 8+ match or lose 0.2 rating.', effect: { type: 'critic', threshold: 8, penalty: 0.2 } },
  { id: 'meatless_mood', name: 'Meatless Mood', description: 'Plant-forward plates get a small bonus.', effect: { type: 'tag_bonus', tag: 'vegetable', multiplier: 1.05 } },
  { id: 'comfort_day', name: 'Comfort Day', description: 'Rich dishes trend with guests.', effect: { type: 'tip_axis_bonus', axis: 'RI', multiplier: 1.08 } },
  { id: 'bright_menu', name: 'Bright Menu', description: 'Acid-forward plates are popular.', effect: { type: 'tip_axis_bonus', axis: 'SO', multiplier: 1.08 } },
  { id: 'spice_rush', name: 'Spice Rush', description: 'Heat lovers tip better today.', effect: { type: 'tip_axis_bonus', axis: 'HT', multiplier: 1.1 } },
  { id: 'slow_lunch', name: 'Slow Lunch', description: 'No bonus — a calm day.', effect: { type: 'none' } },
  { id: 'local_hero', name: 'Local Hero', description: 'High match scores move rating faster.', effect: { type: 'rating_multiplier', multiplier: 1.15 } },
];

const TEMPLATES: CuisineTemplate[] = [
  { tag: 'american', adjectives: ['Hearty', 'Classic', 'Homestyle', 'Rustic'], forms: ['Skillet', 'Plate', 'Bowl', 'Melt'], targetAxes: { UM: { min: 4, max: 8 }, RI: { min: 3, max: 8 } }, preferredEquipment: ['grill', 'prep_station', 'oven'] },
  { tag: 'italian', adjectives: ['Tuscan', 'Sunny', 'Garden', 'Stone-fired'], forms: ['Pasta', 'Bake', 'Risotto', 'Pan'], targetAxes: { UM: { min: 5, max: 9 }, SA: { min: 3, max: 7 } }, preferredEquipment: ['stockpot', 'oven', 'prep_station'] },
  { tag: 'asian', adjectives: ['Silky', 'Aromatic', 'Wok-fired', 'Sesame'], forms: ['Stir-fry', 'Noodle Bowl', 'Steam', 'Glaze'], targetAxes: { UM: { min: 4, max: 9 }, PU: { min: 2, max: 8 } }, preferredEquipment: ['wok', 'stockpot', 'fermentation_crock'] },
  { tag: 'mediterranean', adjectives: ['Coastal', 'Olive', 'Sun-ripe', 'Herbed'], forms: ['Salad', 'Plate', 'Wrap', 'Grill'], targetAxes: { LI: { min: 4, max: 9 }, HE: { min: 3, max: 8 } }, preferredEquipment: ['grill', 'cold_station', 'prep_station'] },
  { tag: 'bbq', adjectives: ['Smoked', 'Charred', 'Pit', 'Fire-kissed'], forms: ['Plate', 'Stack', 'Sliders', 'Rack'], targetAxes: { SM: { min: 4, max: 9 }, UM: { min: 5, max: 9 } }, preferredEquipment: ['smoker', 'grill', 'prep_station'] },
  { tag: 'bakery', adjectives: ['Flaky', 'Golden', 'Buttered', 'Warm'], forms: ['Pastry', 'Loaf', 'Tart', 'Bun'], targetAxes: { SW: { min: 3, max: 9 }, NU: { min: 2, max: 7 } }, preferredEquipment: ['pastry_bench', 'oven', 'prep_station'] },
  { tag: 'cafe', adjectives: ['Velvet', 'Spiced', 'Morning', 'Steamed'], forms: ['Latte Bowl', 'Infusion', 'Parfait', 'Steep'], targetAxes: { SW: { min: 2, max: 7 }, FR: { min: 2, max: 7 } }, preferredEquipment: ['barista_station', 'pastry_bench', 'cold_station'] },
  { tag: 'spiced', adjectives: ['Fragrant', 'Warm-spiced', 'Aromatic', 'Toasted'], forms: ['Rub', 'Stew', 'Roast', 'Seasoned Plate'], targetAxes: { HT: { min: 2, max: 8 }, EA: { min: 2, max: 7 } }, preferredEquipment: ['spice_rack', 'stockpot', 'wok', 'prep_station'] },
  { tag: 'street', adjectives: ['Crispy', 'Loaded', 'Night-market', 'Golden'], forms: ['Fritters', 'Basket', 'Bites', 'Roll'], targetAxes: { CR: { min: 4, max: 9 }, HT: { min: 2, max: 8 } }, preferredEquipment: ['fryer', 'wok', 'grill', 'spice_rack'] },
];

interface Rng {
  next(): number;
  nextInt(min: number, max: number): number;
}

function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next(): number {
      state += 0x6d2b79f5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    nextInt(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
  };
}

function meanAffinity(ids: string[], matrix: Record<string, Record<string, number>>): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      total += matrix[ids[i]!]?.[ids[j]!] ?? 0;
      count++;
    }
  }
  return count === 0 ? 0 : total / count;
}

function generateRecipes(
  ingredients: ReturnType<typeof buildIngredientList>,
  matrix: Record<string, Record<string, number>>,
  targetCount: number,
  seed: number,
): Recipe[] {
  const rng = createRng(seed);
  const byEquipment = new Map<string, typeof ingredients>();
  const byId = new Map(ingredients.map((item) => [item.id, item]));
  for (const item of ingredients) {
    const list = byEquipment.get(item.equipmentId) ?? [];
    list.push(item);
    byEquipment.set(item.equipmentId, list);
  }

  const recipes: Recipe[] = [];
  const seen = new Set<string>();
  let attempts = 0;

  while (recipes.length < targetCount && attempts < targetCount * 40) {
    attempts++;
    const template = TEMPLATES[rng.nextInt(0, TEMPLATES.length - 1)]!;
    const size = rng.nextInt(3, 6);
    const picked: string[] = [];
    const equipmentPool = [...template.preferredEquipment];
    while (picked.length < size) {
      const equipmentId = equipmentPool[rng.nextInt(0, equipmentPool.length - 1)]!;
      const pool = byEquipment.get(equipmentId) ?? [];
      if (pool.length === 0) continue;
      const candidate = pool[rng.nextInt(0, pool.length - 1)]!.id;
      if (!picked.includes(candidate)) picked.push(candidate);
    }
    if (picked.length < 3) continue;

    const key = [...picked].sort().join('|');
    if (seen.has(key)) continue;

    const affinity = meanAffinity(picked, matrix);
    if (affinity < 0.12) continue;

    const adj = template.adjectives[rng.nextInt(0, template.adjectives.length - 1)]!;
    const form = template.forms[rng.nextInt(0, template.forms.length - 1)]!;
    const anchor = byId.get(picked[0]!)!.name;
    const name = `${adj} ${anchor} ${form}`;
    const description = `A ${template.tag} inspired plate built from ${picked.length} pantry staples.`;

    seen.add(key);
    recipes.push({
      id: `recipe_${String(recipes.length + 1).padStart(4, '0')}`,
      name,
      cuisineTag: template.tag,
      ingredientIds: picked,
      description,
    });
  }

  if (recipes.length < targetCount) {
    throw new Error(`Recipe generation stalled at ${recipes.length}/${targetCount}`);
  }

  return recipes;
}

function ensureIngredientCoverage(
  recipes: Recipe[],
  ingredients: ReturnType<typeof buildIngredientList>,
  matrix: Record<string, Record<string, number>>,
  seed: number,
): Recipe[] {
  const rng = createRng(seed);
  const usage = new Map<string, number>();
  const seen = new Set(recipes.map((recipe) => [...recipe.ingredientIds].sort().join('|')));
  for (const recipe of recipes) {
    for (const id of recipe.ingredientIds) {
      usage.set(id, (usage.get(id) ?? 0) + 1);
    }
  }

  const byEquipment = new Map<string, ReturnType<typeof buildIngredientList>>();
  for (const item of ingredients) {
    const list = byEquipment.get(item.equipmentId) ?? [];
    list.push(item);
    byEquipment.set(item.equipmentId, list);
  }

  const output = [...recipes];
  for (const ingredient of ingredients) {
    while ((usage.get(ingredient.id) ?? 0) < 5) {
      const group = byEquipment.get(ingredient.equipmentId) ?? [];
      const picked = new Set<string>([ingredient.id]);
      while (picked.size < 4) {
        const candidate = group[rng.nextInt(0, group.length - 1)]!.id;
        picked.add(candidate);
      }
      const ids = [...picked];
      const key = [...ids].sort().join('|');
      if (seen.has(key)) {
        const extra = ingredients[rng.nextInt(0, ingredients.length - 1)]!.id;
        ids.push(extra);
      }
      const finalKey = [...new Set(ids)].sort().join('|');
      if (seen.has(finalKey)) continue;
      seen.add(finalKey);
      output.push({
        id: `recipe_${String(output.length + 1).padStart(4, '0')}`,
        name: `Pantry ${ingredient.name} Medley`,
        cuisineTag: 'house',
        ingredientIds: [...new Set(ids)].slice(0, 6),
        description: `A house specialty highlighting ${ingredient.name.toLowerCase()}.`,
      });
      for (const id of output.at(-1)!.ingredientIds) {
        usage.set(id, (usage.get(id) ?? 0) + 1);
      }
    }
  }

  void matrix;
  return output;
}

mkdirSync(dataDir, { recursive: true });
mkdirSync(publicDataDir, { recursive: true });

const ingredients = buildIngredientList();
const equipment = buildEquipmentDefinitions();
const compoundAffinity = buildCompoundAffinity(ingredients);
const recipesRaw = generateRecipes(ingredients, compoundAffinity, 1000, 424242);
const recipes = ensureIngredientCoverage(recipesRaw, ingredients, compoundAffinity, 9001);

const outputs = [
  ['ingredients.json', ingredients],
  ['equipment.json', equipment],
  ['recipes.json', recipes],
  ['compound-affinity.json', compoundAffinity],
  ['archetypes.json', ARCHETYPES],
  ['modifiers.json', MODIFIERS],
] as const;

for (const [filename, payload] of outputs) {
  const serialized = JSON.stringify(payload, null, 2);
  writeFileSync(path.join(dataDir, filename), serialized);
  writeFileSync(path.join(publicDataDir, filename), serialized);
}

console.log(`Wrote ${ingredients.length} ingredients, ${equipment.length} equipment, ${recipes.length} recipes`);
