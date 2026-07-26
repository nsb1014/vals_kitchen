import { describe, expect, it } from 'vitest';
import {
  buildDaySummaryDisplay,
  formatMasterySummaryLine,
} from '../../ui/presentation/day-summary-display.ts';

describe('day summary display', () => {
  it('formats earnings, rating, and unlock lines', () => {
    const display = buildDaySummaryDisplay({
      dayEarnings: 200,
      dayBonus: 40,
      volumeBonus: 20,
      averageMatch: 7.5,
      ratingStart: 3,
      ratingEnd: 3.4,
      customersServed: 5,
      seatingCapacity: 8,
      unlockCount: 8,
      totalIngredients: 40,
    });
    expect(display.earningsLine).toBe("Today's earnings: $260");
    expect(display.bonusLine).toBe('Day bonus (avg match ≥7): +$40');
    expect(display.volumeBonusLine).toBe('Volume bonus (5/8 seats): +$20');
    expect(display.averageMatchText).toBe('Average match: 7.5 / 10');
    expect(display.ratingDeltaText).toBe('Rating change: +0.40★ (3.0 → 3.4)');
    expect(display.unlockProgressText).toBe('Ingredients unlocked: 8 / 40');
    expect(display.customersServedText).toBe('Customers served: 5');
    expect(display.masteryLine).toBeNull();
  });

  it('omits bonus lines when bonuses are zero', () => {
    const display = buildDaySummaryDisplay({
      dayEarnings: 10,
      dayBonus: 0,
      volumeBonus: 0,
      averageMatch: 4,
      ratingStart: 3,
      ratingEnd: 3,
      customersServed: 1,
      seatingCapacity: 4,
      unlockCount: 4,
      totalIngredients: 40,
    });
    expect(display.bonusLine).toBeNull();
    expect(display.volumeBonusLine).toBeNull();
  });

  it('omits mastery line when masteryLines are absent or empty', () => {
    expect(formatMasterySummaryLine(undefined)).toBeNull();
    expect(formatMasterySummaryLine([])).toBeNull();
    expect(
      buildDaySummaryDisplay({
        dayEarnings: 10,
        dayBonus: 0,
        volumeBonus: 0,
        averageMatch: 4,
        ratingStart: 3,
        ratingEnd: 3,
        customersServed: 1,
        seatingCapacity: 4,
        unlockCount: 4,
        totalIngredients: 40,
        masteryLines: [],
      }).masteryLine,
    ).toBeNull();
  });

  it('formats mastery line from optional masteryLines', () => {
    expect(formatMasterySummaryLine(['Tomato Soup → Lv.2'])).toBe(
      'Recipe mastery: Tomato Soup → Lv.2',
    );
    const display = buildDaySummaryDisplay({
      dayEarnings: 10,
      dayBonus: 0,
      volumeBonus: 1,
      averageMatch: 8,
      ratingStart: 3,
      ratingEnd: 3.2,
      customersServed: 2,
      seatingCapacity: 4,
      unlockCount: 4,
      totalIngredients: 40,
      masteryLines: ['Tomato Soup → Lv.2', 'Discovered: Rustic Bowl'],
    });
    expect(display.masteryLine).toBe(
      'Recipe mastery: Tomato Soup → Lv.2, Discovered: Rustic Bowl',
    );
    expect(display.volumeBonusLine).toBe('Volume bonus (2/4 seats): +$1');
  });
});
