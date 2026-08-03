import { describe, expect, it } from 'vitest';
import {
  buildRatingDisplayModel,
  formatRecentReview,
  ratingBarPercent,
} from '../../ui/presentation/rating-display.ts';
import { renderRecentReviewsMarkup } from '../../ui/screens/RatingScreen.ts';
import {
  exportSaveCodeSnapshot,
  parseSaveCodeSnapshot,
} from '../../persistence/saveCode.ts';
import { createNewGameState } from '../../domain/state/game-state.ts';
import { createEmptyPresentationCheckpoint } from '../../persistence/presentation-checkpoint.ts';

describe('rating display presentation', () => {
  it('escapes imported review names in the exact Rating-screen markup path', () => {
    const state = createNewGameState(71_001);
    const presentation = createEmptyPresentationCheckpoint();
    presentation.recentReviews = [
      {
        day: 1,
        matchStars: 8,
        ratingDelta: 0.1,
        tip: 12,
        recipeName: '<img src=x onerror=alert(1)>',
      },
    ];
    const imported = parseSaveCodeSnapshot(
      exportSaveCodeSnapshot({ state, presentation }),
    );
    const markup = renderRecentReviewsMarkup(imported.presentation.recentReviews);

    expect(markup).toContain('&lt;img');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('onerror=alert(1)>');
  });

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
