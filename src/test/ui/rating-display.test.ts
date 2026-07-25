import { describe, expect, it } from 'vitest';
import {
  buildRatingDisplayModel,
  formatRecentReview,
  ratingBarPercent,
} from '../../ui/presentation/rating-display.ts';

describe('rating display presentation', () => {
  it('formats rating scale distances to prestige and soft reset', () => {
    const model = buildRatingDisplayModel(4.2, 2);
    expect(model.ratingText).toBe('4.2★');
    expect(model.prestigeMultiplierText).toContain('×');
    expect(model.prestigeDistanceText).toContain('1.8');
    expect(model.softResetDistanceText).toContain('4.2');
    expect(ratingBarPercent(3)).toBe(50);
  });

  it('formats recent review lines', () => {
    const line = formatRecentReview({
      day: 5,
      matchStars: 8.2,
      ratingDelta: 0.16,
      tip: 42,
      recipeName: 'Test Dish',
    });
    expect(line).toContain('Day 5');
    expect(line).toContain('+0.16★');
    expect(line).toContain('Test Dish');
  });
});
