import { describe, expect, it } from 'vitest';
import { formatCustomerRequestText, customerRequestContainsDishName } from '../../ui/presentation/customer-request.ts';
import { AXIS_LABELS } from '../../domain/flavor/axis-labels.ts';

describe('customer request display', () => {
  it('joins multiple phrases into readable request text', () => {
    const preference = {
      primary: { UM: 'high' as const, SO: 'high' as const, SW: 'low' as const },
      avoid: {},
      phrases: ['high Umami', 'high Sour', 'low Sweet'],
    };
    expect(formatCustomerRequestText(preference)).toBe(
      'High Umami, high Sour. Low Sweet.',
    );
  });

  it('uses Flavors-tab axis labels in request wording', () => {
    const preference = {
      primary: { UM: 'high' as const, PU: 'high' as const, HT: 'low' as const },
      avoid: { HT: true },
      phrases: ['high Umami', 'high Pungent', 'low Heat'],
    };
    const text = formatCustomerRequestText(preference);
    expect(text).toContain(AXIS_LABELS.UM);
    expect(text).toContain(AXIS_LABELS.PU);
    expect(text).toContain(AXIS_LABELS.HT);
    expect(text.toLowerCase()).not.toMatch(/savory|garlicky|spicy kick/);
  });

  it('does not treat preference phrases as dish names', () => {
    const text = formatCustomerRequestText({
      primary: { UM: 'high' },
      avoid: {},
      phrases: ['high Umami'],
    });
    expect(customerRequestContainsDishName(text, ['Tomato Soup', 'Garlic Bread'])).toBe(false);
  });
});
