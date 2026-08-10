import { reviewDelta } from '../../domain/rating/update.ts';
import type { DailyModifier } from '../../domain/day/modifiers.ts';
import type { Archetype } from '../../domain/types.ts';
import { buildGuestVoiceLine } from './guest-voice.ts';

export interface ReviewDisplay {
  starsText: string;
  starsFilled: number;
  tipText: string;
  ratingDeltaText: string;
  ratingDeltaPositive: boolean;
  recipeLine: string | null;
  masteryLine: string | null;
  /** Archetype-authored quip keyed by match tier; null when no archetype given. */
  guestVoiceLine: string | null;
}

export {
  buildGuestVoiceLine,
  matchTierFromStars,
  type MatchTier,
} from './guest-voice.ts';

export function formatStars(matchStars: number): string {
  return `${matchStars.toFixed(1)} / 10`;
}

export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

export function formatRatingDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(2)}★`;
}

export function expectedRatingDelta(matchStars: number, multiplier = 1): number {
  return reviewDelta(matchStars, multiplier);
}

export function formatReviewModifierLine(
  modifier: DailyModifier | null,
  matchStars: number,
  prestigeScale = 1,
): string | null {
  if (!modifier) return null;
  if (
    modifier.effect.type === 'critic' &&
    matchStars < modifier.effect.threshold
  ) {
    return `${modifier.name} penalty: -${(
      modifier.effect.penalty * prestigeScale
    ).toFixed(2)}★`;
  }
  if (
    modifier.effect.type === 'rating_multiplier' &&
    modifier.effect.multiplier !== 1
  ) {
    return `${modifier.name}: rating change ×${modifier.effect.multiplier.toFixed(2)}`;
  }
  return null;
}

export function buildReviewDisplay(input: {
  matchStars: number;
  tip: number;
  ratingDelta: number;
  recipeName: string | null;
  masteryLine?: string | null;
  archetype?: Pick<Archetype, 'id' | 'name' | 'primaryAxisWeights'> | null;
}): ReviewDisplay {
  const starsFilled = Math.round(input.matchStars);
  return {
    starsText: formatStars(input.matchStars),
    starsFilled: Math.min(10, Math.max(0, starsFilled)),
    tipText: formatCurrency(input.tip),
    ratingDeltaText: formatRatingDelta(input.ratingDelta),
    ratingDeltaPositive: input.ratingDelta >= 0,
    recipeLine: input.recipeName ? `Named dish: ${input.recipeName}` : null,
    masteryLine: input.masteryLine ?? null,
    guestVoiceLine: input.archetype
      ? buildGuestVoiceLine(input.archetype, input.matchStars)
      : null,
  };
}

export function renderStarGlyphs(filled: number, max = 10): string {
  const clamped = Math.min(max, Math.max(0, filled));
  return `${'★'.repeat(clamped)}${'☆'.repeat(max - clamped)}`;
}
