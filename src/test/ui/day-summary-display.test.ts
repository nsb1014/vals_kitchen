import { describe, expect, it } from 'vitest';
import {
  buildDaySummaryDisplay,
  formatMasterySummaryLine,
} from '../../ui/presentation/day-summary-display.ts';

describe('day summary display', () => {
  it('formats earnings, rating, and unlock lines', () => {
    const display = buildDaySummaryDisplay({
      completedDay: 1,
      nextDay: 2,
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
    expect(display.completedDay).toBe(1);
    expect(display.nextDay).toBe(2);
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
      completedDay: 1,
      nextDay: 2,
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
        completedDay: 1,
        nextDay: 2,
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
      completedDay: 1,
      nextDay: 2,
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

  it('reports a non-zero rating change when start and end differ', () => {
    const display = buildDaySummaryDisplay({
      completedDay: 1,
      nextDay: 2,
      dayEarnings: 100,
      dayBonus: 0,
      volumeBonus: 0,
      averageMatch: 8,
      ratingStart: 3.0,
      ratingEnd: 3.45,
      customersServed: 4,
      seatingCapacity: 4,
      unlockCount: 5,
      totalIngredients: 40,
    });
    expect(display.ratingDeltaText).toMatch(/\+0\.45★/);
    expect(display.ratingDeltaText).toContain('3.0 → 3.5');
  });

  it('reports review gains without treating a prestige reset as a loss', () => {
    const display = buildDaySummaryDisplay({
      completedDay: 1,
      nextDay: 2,
      dayEarnings: 300,
      dayBonus: 20,
      volumeBonus: 20,
      averageMatch: 8.5,
      ratingStart: 5.8,
      ratingEnd: 3,
      ratingDelta: 0.25,
      ratingResetOccurred: true,
      customersServed: 4,
      seatingCapacity: 4,
      unlockCount: 12,
      totalIngredients: 40,
    });

    expect(display.ratingDeltaText).toBe(
      'Rating change from reviews: +0.25★ (reset excluded)',
    );
    expect(display.ratingDeltaText).not.toContain('-');
  });
});
