import { guestVariant } from '../../canvas/world/character-frames.ts';

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** Uses a dedicated head crop from the same source frame as the floor actor. */
export function renderGuestPortraitHtml(
  guestId: string,
  options?: { voiceLine?: string | null; testId?: string },
): string {
  const variant = guestVariant(guestId);
  const voice = options?.voiceLine?.trim();
  const alt = voice ? escapeAttr(voice) : '';
  const testId = options?.testId ?? 'guest-portrait';
  return `<img class="guest-portrait" src="/assets/portraits/guest_${variant}.png" alt="${alt}" data-testid="${escapeAttr(testId)}"${voice ? '' : ' aria-hidden="true"'}>`;
}
