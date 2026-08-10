import { describe, expect, it } from 'vitest';
import {
  generateGuestGibberish,
  guestGibberishMoodFromPreference,
} from '../ui/presentation/guest-gibberish.ts';
import {
  buildOrderBubbleCues,
  buildOrderBubbleSpeech,
  orderBubbleSeed,
  renderOrderBubbleHtml,
} from '../ui/presentation/order-bubble.ts';
import type { CustomerPreference } from '../domain/types.ts';

const preference: CustomerPreference = {
  primary: { UM: 'high', SA: 'low' },
  avoid: { HT: true },
  phrases: ['high Umami', 'low Salty'],
};

describe('cooking guest gibberish', () => {
  it('is deterministic for the same seed', () => {
    const seed = orderBubbleSeed({ guestId: 'guest-a', ticketId: 'ticket-1' });
    expect(generateGuestGibberish(seed)).toBe(generateGuestGibberish(seed));
    expect(generateGuestGibberish(seed, { mood: 'eager', archetypeId: 'heat_lover' })).toBe(
      generateGuestGibberish(seed, { mood: 'eager', archetypeId: 'heat_lover' }),
    );
  });

  it('differs across guest/ticket seeds', () => {
    const a = generateGuestGibberish(
      orderBubbleSeed({ guestId: 'guest-a', ticketId: 't1' }),
    );
    const b = generateGuestGibberish(
      orderBubbleSeed({ guestId: 'guest-b', ticketId: 't1' }),
    );
    const c = generateGuestGibberish(
      orderBubbleSeed({ guestId: 'guest-a', ticketId: 't2' }),
    );
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('keeps a screen-reader summary of the real order text', () => {
    const speech = buildOrderBubbleSpeech({
      preference,
      seed: orderBubbleSeed({ guestId: 'g1', ticketId: 'tk' }),
      archetypeId: 'umami_hunter',
    });
    const html = renderOrderBubbleHtml(speech);
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('Order:');
    expect(html).toContain('High Umami');
    expect(html).toContain('data-testid="order-bubble-gibberish"');
    expect(html).toContain(speech.gibberish);
    expect(html).not.toContain('>High Umami, low Salty.<');
    expect(guestGibberishMoodFromPreference(preference)).toBe('cheerful');
  });

  it('pairs gibberish with ticket cue iconography', () => {
    const cues = buildOrderBubbleCues(preference);
    expect(cues.map((cue) => cue.axis)).toEqual(['SA', 'UM', 'HT']);
    const html = renderOrderBubbleHtml(
      buildOrderBubbleSpeech({
        preference,
        seed: 'cue-seed',
      }),
    );
    expect(html).toContain('data-testid="order-bubble-ticket-icon"');
    expect(html).toContain('data-testid="order-bubble-cue"');
    expect(html).toContain('data-axis="UM"');
  });
});
