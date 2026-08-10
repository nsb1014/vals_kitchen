import { describe, expect, it } from 'vitest';
import {
  buildGuestVoiceLine,
  buildReviewDisplay,
  matchTierFromStars,
} from '../ui/presentation/review-display.ts';
import { testContext } from './test-helpers.ts';

describe('meta guest voice lines', () => {
  it('maps match stars onto poor / okay / good / great tiers', () => {
    expect(matchTierFromStars(2.1)).toBe('poor');
    expect(matchTierFromStars(5)).toBe('okay');
    expect(matchTierFromStars(7.4)).toBe('good');
    expect(matchTierFromStars(9.2)).toBe('great');
  });

  it('builds stable archetype quips from read-only archetype weights', () => {
    const hunter = testContext.archetypes.find((item) => item.id === 'umami_hunter');
    expect(hunter).toBeDefined();
    const great = buildGuestVoiceLine(hunter!, 9.5);
    const again = buildGuestVoiceLine(hunter!, 9.5);
    expect(great).toBe(again);
    expect(great.toLowerCase()).toMatch(/umami|hunter/);
    const poor = buildGuestVoiceLine(hunter!, 1.2);
    expect(poor).not.toBe(great);
    expect(poor.toLowerCase()).toMatch(/umami|hunter|hoped|hungry|craving/);
  });

  it('attaches guestVoiceLine on review display when archetype is supplied', () => {
    const archetype = testContext.archetypes[0]!;
    const withVoice = buildReviewDisplay({
      matchStars: 8.1,
      tip: 40,
      ratingDelta: 0.12,
      recipeName: null,
      archetype,
    });
    expect(withVoice.guestVoiceLine).toBeTruthy();
    expect(withVoice.guestVoiceLine).toContain(archetype.name);

    const without = buildReviewDisplay({
      matchStars: 8.1,
      tip: 40,
      ratingDelta: 0.12,
      recipeName: null,
    });
    expect(without.guestVoiceLine).toBeNull();
  });
});
