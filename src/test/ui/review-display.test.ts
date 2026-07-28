import { describe, expect, it } from 'vitest';
import {
  buildReviewDisplay,
  formatCurrency,
  formatRatingDelta,
  formatReviewModifierLine,
  formatStars,
  renderStarGlyphs,
} from '../../ui/presentation/review-display.ts';

describe('review display presentation', () => {
  it('formats stars, tip, and rating delta for the review card', () => {
    const display = buildReviewDisplay({
      matchStars: 8.2,
      tip: 148,
      ratingDelta: 0.16,
      recipeName: 'Rustic Pantry Bowl',
    });
    expect(formatStars(8.2)).toBe('8.2 / 10');
    expect(formatCurrency(148)).toBe('$148');
    expect(formatRatingDelta(0.16)).toBe('+0.16★');
    expect(display.starsFilled).toBe(8);
    expect(display.recipeLine).toBe('Named dish: Rustic Pantry Bowl');
    expect(renderStarGlyphs(8)).toBe('★★★★★★★★☆☆');
  });

  it('shows negative rating movement without a plus sign', () => {
    const display = buildReviewDisplay({
      matchStars: 2.5,
      tip: 12,
      ratingDelta: -0.2,
      recipeName: null,
    });
    expect(display.ratingDeltaText).toBe('-0.20★');
    expect(display.ratingDeltaPositive).toBe(false);
    expect(display.recipeLine).toBeNull();
    expect(display.masteryLine).toBeNull();
  });

  it('includes mastery line on the review card when provided', () => {
    const display = buildReviewDisplay({
      matchStars: 8.2,
      tip: 148,
      ratingDelta: 0.16,
      recipeName: 'Rustic Pantry Bowl',
      masteryLine: 'Mastery Lv.2 (+0.10★)',
    });
    expect(display.masteryLine).toBe('Mastery Lv.2 (+0.10★)');
  });

  it('explains rating modifiers that change the review result', () => {
    expect(
      formatReviewModifierLine(
        {
          id: 'critic_visit',
          name: 'Food Critic',
          description: '',
          effect: { type: 'critic', threshold: 8, penalty: 0.2 },
        },
        4.2,
      ),
    ).toBe('Food Critic penalty: -0.20★');
    expect(
      formatReviewModifierLine(
        {
          id: 'local_hero',
          name: 'Local Hero',
          description: '',
          effect: { type: 'rating_multiplier', multiplier: 1.15 },
        },
        8,
      ),
    ).toBe('Local Hero: rating change ×1.15');
  });
});
