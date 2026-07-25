export function basePayout(day: number): number {
  return Math.floor(20 + 8 * Math.pow(day, 0.55));
}

export function ratingMultiplier(stars: number): number {
  return Math.pow(Math.max(0, stars / 3), 1.3);
}

export function prestigeMultiplier(prestige: number): number {
  return Math.pow(1.18, prestige);
}

export function matchQualityFactor(matchStars: number): number {
  const mq = matchStars / 10;
  return 0.3 + 0.7 * Math.pow(mq, 1.5);
}

export interface TipInput {
  day: number;
  rating: number;
  prestige: number;
  matchStars: number;
  tipMultiplier?: number;
}

export function computeTip(input: TipInput): number {
  const mult = input.tipMultiplier ?? 1;
  return Math.floor(
    basePayout(input.day)
    * ratingMultiplier(input.rating)
    * prestigeMultiplier(input.prestige)
    * matchQualityFactor(input.matchStars)
    * mult,
  );
}

export function dayBonusEarnings(dayEarnings: number, averageMatch: number): number {
  if (averageMatch >= 7.0) {
    return Math.floor(dayEarnings * 0.05);
  }
  return 0;
}
