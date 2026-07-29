export interface RatingResult {
  rating: number;
  delta: number;
  prestigeTriggered: boolean;
  softResetTriggered: boolean;
}

/**
 * Rating pacing is intentionally slower than the 0–10 review score. With a
 * well-matched dish now scoring around 9+, this keeps the first prestige cycle
 * near four service days instead of letting accurate scoring skip progression.
 */
export const REVIEW_RATING_DELTA_PER_STAR = 0.04;

export function reviewDelta(matchStars: number, multiplier = 1): number {
  return (matchStars - 5) * REVIEW_RATING_DELTA_PER_STAR * multiplier;
}

export function applyReview(
  currentRating: number,
  matchStars: number,
  deltaMultiplier = 1,
): RatingResult {
  const delta = reviewDelta(matchStars, deltaMultiplier);
  const next = Math.min(6, Math.max(0, currentRating + delta));
  return {
    rating: next >= 6 ? 3 : next,
    delta,
    prestigeTriggered: next >= 6,
    softResetTriggered: next <= 0,
  };
}
