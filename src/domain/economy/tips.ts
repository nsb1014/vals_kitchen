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

/**
 * End-of-day volume bonus: up to +10% of tip earnings when covers fill seating capacity.
 * Utilization = customersServed / seatingCapacity (clamped 0–1). Day length is irrelevant —
 * the daily pool is already capped by seats (§5 customers_per_day), so this rewards buying
 * and filling more seats, not stretching the same covers over a longer session.
 */
export const VOLUME_BONUS_RATE = 0.1;

export function volumeBonusEarnings(
  dayEarnings: number,
  customersServed: number,
  seatingCapacity: number,
): number {
  if (dayEarnings <= 0 || customersServed <= 0 || seatingCapacity <= 0) {
    return 0;
  }
  const utilization = Math.min(1, customersServed / seatingCapacity);
  return Math.floor(dayEarnings * VOLUME_BONUS_RATE * utilization);
}
