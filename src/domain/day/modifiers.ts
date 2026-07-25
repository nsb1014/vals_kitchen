import type { AxisKey, FlavorVector } from '../types.ts';

export type ModifierEffect =
  | { type: 'none' }
  | { type: 'tip_axis_bonus'; axis: AxisKey; multiplier: number }
  | { type: 'critic'; threshold: number; penalty: number }
  | { type: 'tag_bonus'; tag: string; multiplier: number }
  | { type: 'rating_multiplier'; multiplier: number };

export interface DailyModifier {
  id: string;
  name: string;
  description: string;
  effect: ModifierEffect;
}

export interface ModifierOutcome {
  tipMultiplier: number;
  ratingDeltaMultiplier: number;
  extraRatingDelta: number;
}

export function applyModifierEffects(
  modifier: DailyModifier | undefined,
  dish: FlavorVector,
  matchStars: number,
  ingredientCategories: string[],
): ModifierOutcome {
  const outcome: ModifierOutcome = {
    tipMultiplier: 1,
    ratingDeltaMultiplier: 1,
    extraRatingDelta: 0,
  };
  if (!modifier) return outcome;

  switch (modifier.effect.type) {
    case 'tip_axis_bonus':
      if (dish[modifier.effect.axis] >= 5) {
        outcome.tipMultiplier *= modifier.effect.multiplier;
      }
      break;
    case 'tag_bonus': {
      const tag = modifier.effect.tag;
      if (ingredientCategories.every((category) => category === tag)) {
        outcome.tipMultiplier *= modifier.effect.multiplier;
      }
      break;
    }
    case 'critic':
      if (matchStars < modifier.effect.threshold) {
        outcome.extraRatingDelta -= modifier.effect.penalty;
      }
      break;
    case 'rating_multiplier':
      outcome.ratingDeltaMultiplier *= modifier.effect.multiplier;
      break;
    case 'none':
      break;
  }

  return outcome;
}

export function pickModifier(_day: number, modifiers: DailyModifier[], seed: number): DailyModifier {
  if (modifiers.length === 0) {
    return { id: 'none', name: 'Normal Day', description: '', effect: { type: 'none' } };
  }
  const index = seed % modifiers.length;
  return modifiers[index] ?? modifiers[0]!;
}
