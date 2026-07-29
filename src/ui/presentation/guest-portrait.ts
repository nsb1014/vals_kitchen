import { guestVariant } from '../../canvas/world/character-frames.ts';

/**
 * Uses the same stable guest variant as the restaurant actor. CSS crops the
 * face from that variant's down-facing frame in the shared character atlas.
 */
export function renderGuestPortraitHtml(guestId: string): string {
  const variant = guestVariant(guestId);
  return `<span class="guest-portrait guest-portrait-${variant}" data-testid="guest-portrait" aria-hidden="true"></span>`;
}
