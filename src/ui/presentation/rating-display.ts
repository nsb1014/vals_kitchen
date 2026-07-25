import { prestigeMultiplier, ratingMultiplier } from '../../domain/economy/tips.ts';
import { reviewDelta } from '../../domain/rating/update.ts';

export interface RecentReviewEntry {
  matchStars: number;
  ratingDelta: number;
  tip: number;
  recipeName: string | null;
  day: number;
}

export interface RatingDisplayModel {
  rating: number;
  ratingText: string;
  prestige: number;
  prestigeMultiplierText: string;
  ratingMultiplierText: string;
  starsToPrestige: number;
  starsToSoftReset: number;
  prestigeDistanceText: string;
  softResetDistanceText: string;
  ratingScaleMarkers: Array<{ value: number; label: string; active: boolean }>;
}

export function formatRating(stars: number): string {
  return `${stars.toFixed(1)}★`;
}

export function formatMultiplier(value: number): string {
  return `${value.toFixed(2)}×`;
}

export function buildRatingDisplayModel(
  rating: number,
  prestige: number,
): RatingDisplayModel {
  const clamped = Math.min(6, Math.max(0, rating));
  const starsToPrestige = Math.max(0, 6 - clamped);
  const starsToSoftReset = clamped;

  return {
    rating: clamped,
    ratingText: formatRating(clamped),
    prestige,
    prestigeMultiplierText: formatMultiplier(prestigeMultiplier(prestige)),
    ratingMultiplierText: formatMultiplier(ratingMultiplier(clamped)),
    starsToPrestige,
    starsToSoftReset,
    prestigeDistanceText: `${starsToPrestige.toFixed(1)}★ to prestige at 6.0`,
    softResetDistanceText: `${starsToSoftReset.toFixed(1)}★ above soft reset at 0.0`,
    ratingScaleMarkers: [0, 1, 2, 3, 4, 5, 6].map((value) => ({
      value,
      label: String(value),
      active: Math.abs(clamped - value) < 0.05 || (value === 6 && clamped >= 5.95),
    })),
  };
}

export function formatRecentReview(entry: RecentReviewEntry): string {
  const deltaSign = entry.ratingDelta >= 0 ? '+' : '';
  const recipe = entry.recipeName ? ` · ${entry.recipeName}` : '';
  return `Day ${entry.day}: ${entry.matchStars.toFixed(1)}/10 → ${deltaSign}${entry.ratingDelta.toFixed(2)}★${recipe}`;
}

export function ratingBarPercent(rating: number): number {
  return Math.min(100, Math.max(0, (rating / 6) * 100));
}

export function expectedRatingDeltaForMatch(matchStars: number, multiplier = 1): number {
  return reviewDelta(matchStars, multiplier);
}
