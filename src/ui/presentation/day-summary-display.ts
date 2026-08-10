import { formatCurrency, formatRatingDelta } from './review-display.ts';

export interface DaySummaryDisplayInput {
  completedDay: number;
  nextDay: number;
  dayEarnings: number;
  dayBonus: number;
  volumeBonus: number;
  averageMatch: number;
  ratingStart: number;
  ratingEnd: number;
  /** Review-earned delta, excluding prestige/soft-reset jumps. */
  ratingDelta?: number;
  ratingResetOccurred?: boolean;
  customersServed: number;
  seatingCapacity: number;
  unlockCount: number;
  totalIngredients: number;
  /** Optional preformatted mastery / discovery lines from the store summary builder. */
  masteryLines?: string[];
}

export interface DaySummaryDisplay {
  completedDay: number;
  nextDay: number;
  earningsLine: string;
  bonusLine: string | null;
  volumeBonusLine: string | null;
  averageMatchText: string;
  ratingDeltaText: string;
  unlockProgressText: string;
  customersServedText: string;
  /** Null when the store does not supply mastery/discovery info for the day. */
  masteryLine: string | null;
}

export interface TomorrowPreviewInput {
  nextDay: number;
  expectedCustomers: number;
  seatingCapacity: number;
  modifierName: string;
  modifierDescription?: string | null;
  prestigeDistanceText: string;
  nearestAchievementLine?: string | null;
}

export interface TomorrowPreviewDisplay {
  title: string;
  customersLine: string;
  modifierLine: string;
  prestigeLine: string;
  achievementLine: string | null;
}

export function formatMasterySummaryLine(masteryLines: string[] | undefined): string | null {
  if (!masteryLines || masteryLines.length === 0) return null;
  return `Recipe mastery: ${masteryLines.join(', ')}`;
}

export function buildDaySummaryDisplay(input: DaySummaryDisplayInput): DaySummaryDisplay {
  const totalEarnings = input.dayEarnings + input.dayBonus + input.volumeBonus;
  const ratingDelta = input.ratingDelta ?? input.ratingEnd - input.ratingStart;
  const capacity = Math.max(1, input.seatingCapacity);
  return {
    completedDay: input.completedDay,
    nextDay: input.nextDay,
    earningsLine: `Today's earnings: ${formatCurrency(totalEarnings)}`,
    bonusLine:
      input.dayBonus > 0
        ? `Day bonus (avg match ≥7): +${formatCurrency(input.dayBonus)}`
        : null,
    volumeBonusLine:
      input.volumeBonus > 0
        ? `Volume bonus (${input.customersServed}/${capacity} seats): +${formatCurrency(input.volumeBonus)}`
        : null,
    averageMatchText: `Average match: ${input.averageMatch.toFixed(1)} / 10`,
    ratingDeltaText: input.ratingResetOccurred
      ? `Rating change from reviews: ${formatRatingDelta(ratingDelta)} (reset excluded)`
      : `Rating change: ${formatRatingDelta(ratingDelta)} (${input.ratingStart.toFixed(1)} → ${input.ratingEnd.toFixed(1)})`,
    unlockProgressText: `Ingredients unlocked: ${input.unlockCount} / ${input.totalIngredients}`,
    customersServedText: `Customers served: ${input.customersServed}`,
    masteryLine: formatMasterySummaryLine(input.masteryLines),
  };
}

/** Forward-looking end-of-day ritual panel (Stardew-style tomorrow hook). */
export function buildTomorrowPreview(
  input: TomorrowPreviewInput,
): TomorrowPreviewDisplay {
  const seats = Math.max(1, input.seatingCapacity);
  const expected = Math.max(0, Math.min(input.expectedCustomers, seats));
  const modifierDetail = input.modifierDescription?.trim();
  return {
    title: `Tomorrow — Day ${input.nextDay}`,
    customersLine: `Expected guests: ${expected} (seats ${seats})`,
    modifierLine: modifierDetail
      ? `Modifier: ${input.modifierName} — ${modifierDetail}`
      : `Modifier: ${input.modifierName}`,
    prestigeLine: input.prestigeDistanceText,
    achievementLine: input.nearestAchievementLine ?? null,
  };
}
