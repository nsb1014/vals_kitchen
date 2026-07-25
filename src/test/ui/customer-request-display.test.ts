import { describe, expect, it } from 'vitest';
import { formatCustomerRequestText, customerRequestContainsDishName } from '../../ui/presentation/customer-request.ts';
import type { CustomerPreference } from '../../domain/types.ts';

describe('customer request presentation', () => {
  it('joins multiple phrases into readable request text', () => {
    const preference: CustomerPreference = {
      primary: { UM: 'high', SO: 'high' },
      avoid: { SW: true },
      phrases: ['something really savory', 'bright and tangy', 'not sweet at all'],
    };
    expect(formatCustomerRequestText(preference)).toBe(
      'Something really savory, bright and tangy. Not sweet at all.',
    );
  });

  it('does not treat preference phrases as dish names', () => {
    const text = formatCustomerRequestText({
      primary: { UM: 'high' },
      avoid: {},
      phrases: ['something really savory'],
    });
    expect(customerRequestContainsDishName(text, ['Chicken Alfredo', 'Margherita Pizza'])).toBe(
      false,
    );
  });
});
