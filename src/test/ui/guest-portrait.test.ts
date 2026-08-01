import { describe, expect, it } from 'vitest';
import { guestVariant } from '../../canvas/world/character-frames.ts';
import { renderGuestPortraitHtml } from '../../ui/presentation/guest-portrait.ts';

describe('guest portrait', () => {
  it('uses the same stable character variant as the restaurant actor', () => {
    const guestId = 'guest_customer_1_0';
    const html = renderGuestPortraitHtml(guestId);

    expect(html).toContain(`/assets/portraits/guest_${guestVariant(guestId)}.png`);
    expect(html).toContain('data-testid="guest-portrait"');
    expect(html).not.toMatch(/>\s*\d+\s*</);
  });
});
