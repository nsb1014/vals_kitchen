import { formatCurrency, formatRatingDelta } from './review-display.ts';

export interface DaySummaryDisplayInput {
  dayEarnings: number;
  dayBonus: number;
  averageMatch: number;
  ratingStart: number;
  ratingEnd: number;
  customersServed: number;
  unlockCount: number;
  totalIngredients: number;
  /** Optional preformatted mastery / discovery lines from the store summary builder. */
  masteryLines?: string[];
}

export interface DaySummaryDisplay {
  earningsLine: string;
  bonusLine: string | null;
  averageMatchText: string;
  ratingDeltaText: string;
  unlockProgressText: string;
  customersServedText: string;
  /** Null when the store does not supply mastery/discovery info for the day. */
  masteryLine: string | null;
}

export function formatMasterySummaryLine(masteryLines: string[] | undefined): string | null {
  if (!masteryLines || masteryLines.length === 0) return null;
  return `Recipe mastery: ${masteryLines.join(', ')}`;
}

export function buildDaySummaryDisplay(input: DaySummaryDisplayInput): DaySummaryDisplay {
  const totalEarnings = input.dayEarnings + input.dayBonus;
  const ratingDelta = input.ratingEnd - input.ratingStart;
  return {
    earningsLine: `Today's earnings: ${formatCurrency(totalEarnings)}`,
    bonusLine:
      input.dayBonus > 0
        ? `Day bonus (avg match ≥7): +${formatCurrency(input.dayBonus)}`
        : null,
    averageMatchText: `Average match: ${input.averageMatch.toFixed(1)} / 10`,
    ratingDeltaText: `Rating change: ${formatRatingDelta(ratingDelta)} (${input.ratingStart.toFixed(1)} → ${input.ratingEnd.toFixed(1)})`,
    unlockProgressText: `Ingredients unlocked: ${input.unlockCount} / ${input.totalIngredients}`,
    customersServedText: `Customers served: ${input.customersServed}`,
    masteryLine: formatMasterySummaryLine(input.masteryLines),
  };
}
