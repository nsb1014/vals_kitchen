export interface RatingResult {
  rating: number;
  delta: number;
  prestigeTriggered: boolean;
  softResetTriggered: boolean;
}

export function reviewDelta(matchStars: number, multiplier = 1): number {
  return (matchStars - 5) * 0.08 * multiplier;
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
