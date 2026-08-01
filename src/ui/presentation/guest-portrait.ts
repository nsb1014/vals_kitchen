import { guestVariant } from '../../canvas/world/character-frames.ts';

/** Uses a dedicated head crop from the same source frame as the floor actor. */
export function renderGuestPortraitHtml(guestId: string): string {
  const variant = guestVariant(guestId);
  return `<img class="guest-portrait" src="/assets/portraits/guest_${variant}.png" alt="" data-testid="guest-portrait" aria-hidden="true">`;
}
