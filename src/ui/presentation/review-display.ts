import { reviewDelta } from '../../domain/rating/update.ts';

export interface ReviewDisplay {
  starsText: string;
  starsFilled: number;
  tipText: string;
  ratingDeltaText: string;
  ratingDeltaPositive: boolean;
  recipeLine: string | null;
  masteryLine: string | null;
}

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

export function buildReviewDisplay(input: {
  matchStars: number;
  tip: number;
  ratingDelta: number;
  recipeName: string | null;
  masteryLine?: string | null;
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
  };
}

export function renderStarGlyphs(filled: number, max = 10): string {
  const clamped = Math.min(max, Math.max(0, filled));
  return `${'★'.repeat(clamped)}${'☆'.repeat(max - clamped)}`;
}
