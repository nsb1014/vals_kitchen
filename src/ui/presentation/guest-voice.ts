import type { Archetype, AxisKey } from '../../domain/types.ts';

export type MatchTier = 'poor' | 'okay' | 'good' | 'great';

const AXIS_FLAVOR: Partial<Record<AxisKey, string>> = {
  UM: 'umami',
  SW: 'sweet',
  SA: 'savory',
  SO: 'tangy',
  BI: 'bitter',
  HE: 'herbal',
  FR: 'fruity',
  EA: 'earthy',
  SM: 'smoky',
  PU: 'pungent',
  NU: 'nutty',
  RI: 'rich',
  LI: 'light',
  HT: 'spicy',
  CR: 'crunchy',
};

function withArticle(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

const TIER_TEMPLATES: Record<
  MatchTier,
  ReadonlyArray<(name: string, flavor: string) => string>
> = {
  poor: [
    (name, flavor) =>
      `"Hmm… that missed my ${flavor} craving," sighs the ${name}.`,
    (name, flavor) =>
      `"I came for ${flavor} notes and left hungry," mutters the ${name}.`,
    (name) => `"Not quite what I hoped for," the ${name} admits.`,
  ],
  okay: [
    (name, flavor) =>
      `"Decent bite — could use more ${flavor}," notes the ${name}.`,
    (name) => `"Solid enough for a weeknight," says the ${name}.`,
    (name, flavor) =>
      `"I taste a hint of ${flavor}. Keep going," the ${name} nods.`,
  ],
  good: [
    (name, flavor) =>
      `"Now that's the ${flavor} I was hunting!" beams the ${name}.`,
    (name) => `"You've got my number," grins the ${name}.`,
    (name, flavor) =>
      `"Bright ${flavor} balance — I'll be back," says the ${name}.`,
  ],
  great: [
    (name, flavor) =>
      `"Perfection — pure ${flavor} joy!" cheers the ${name}.`,
    (name) => `"Write that one down — I'm telling everyone," raves the ${name}.`,
    (name, flavor) =>
      `"${withArticle(flavor)} masterpiece. Chef's kiss," sighs the ${name}.`,
  ],
};

export function matchTierFromStars(matchStars: number): MatchTier {
  if (matchStars >= 9) return 'great';
  if (matchStars >= 7) return 'good';
  if (matchStars >= 4) return 'okay';
  return 'poor';
}

function primaryFlavorWord(archetype: Pick<Archetype, 'primaryAxisWeights'>): string {
  const entries = Object.entries(archetype.primaryAxisWeights) as Array<
    [AxisKey, number]
  >;
  entries.sort((left, right) => right[1] - left[1]);
  const top = entries[0]?.[0];
  return (top && AXIS_FLAVOR[top]) || 'flavor';
}

/** Stable index from archetype id + tier so the same guest/score repeats the same line. */
function templateIndex(archetypeId: string, tier: MatchTier, count: number): number {
  let hash = 0;
  const key = `${archetypeId}:${tier}`;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return count === 0 ? 0 : hash % count;
}

/**
 * Data-driven guest quip keyed by archetype + match tier.
 * Archetype catalog is read-only; templates live here and use each archetype's axes.
 */
export function buildGuestVoiceLine(
  archetype: Pick<Archetype, 'id' | 'name' | 'primaryAxisWeights'>,
  matchStars: number,
): string {
  const tier = matchTierFromStars(matchStars);
  const templates = TIER_TEMPLATES[tier];
  const pick = templates[templateIndex(archetype.id, tier, templates.length)]!;
  return pick(archetype.name, primaryFlavorWord(archetype));
}
