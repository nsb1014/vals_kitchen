import type { CustomerPreference } from '../../domain/types.ts';

/** Sims-like speech mood — drives length and punctuation only (presentation). */
export type GuestGibberishMood = 'calm' | 'eager' | 'fussy' | 'cheerful';

const SYLLABLES = [
  'sul',
  'dag',
  'wib',
  'bler',
  'nom',
  'za',
  'woo',
  'mbo',
  'flib',
  'ber',
  'noo',
  'bosh',
  'vig',
  'plo',
  'mes',
  'ah',
  'ooh',
  'nee',
  'wum',
  'bo',
  'chir',
  'pax',
  'rel',
  'do',
  'shi',
  'ba',
  'loo',
  'mim',
  'zor',
  'kep',
] as const;

const OPENERS = ['Sul sul', 'Dag dag', 'Wib-wib', 'Noo noo', 'Ooh', 'Bosh'] as const;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function capitalize(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length) % list.length]!;
}

/**
 * Derive a presentation mood from preference intensity.
 * More primary/avoid axes → fussier / more eager babble.
 */
export function guestGibberishMoodFromPreference(
  preference: CustomerPreference,
): GuestGibberishMood {
  const primaryCount = Object.keys(preference.primary).length;
  const avoidCount = Object.keys(preference.avoid).length;
  if (avoidCount >= 2) return 'fussy';
  if (primaryCount >= 3) return 'eager';
  if (primaryCount <= 1 && avoidCount === 0) return 'calm';
  return 'cheerful';
}

/**
 * Deterministic Sims-style gibberish keyed by guest + ticket (or any seed).
 * Same seed always yields the same babble; mood/archetype only reshape style.
 */
export function generateGuestGibberish(
  seed: string,
  options?: {
    mood?: GuestGibberishMood;
    /** Optional archetype id nudges syllable palette — catalog stays read-only. */
    archetypeId?: string;
  },
): string {
  const mood = options?.mood ?? 'cheerful';
  const archetypeSalt = options?.archetypeId?.trim() ?? '';
  const rand = mulberry32(hashSeed(`${seed}|${archetypeSalt}|${mood}`));

  const wordCount =
    mood === 'calm' ? 2 + Math.floor(rand() * 2) : mood === 'eager' ? 5 + Math.floor(rand() * 3) : mood === 'fussy' ? 4 + Math.floor(rand() * 3) : 3 + Math.floor(rand() * 3);

  const opener = capitalize(pick(rand, OPENERS));
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const parts = 1 + Math.floor(rand() * (mood === 'eager' ? 3 : 2));
    let word = '';
    for (let p = 0; p < parts; p++) {
      word += pick(rand, SYLLABLES);
    }
    if (rand() < 0.22 && parts > 1) {
      const split = 1 + Math.floor(rand() * (word.length - 1));
      word = `${word.slice(0, split)}-${word.slice(split)}`;
    }
    words.push(word);
  }

  let body = words.join(' ');
  if (mood === 'fussy' && rand() < 0.55) {
    body = `${body}… ${pick(rand, SYLLABLES)}`;
  }

  const endPunct =
    mood === 'eager' ? '!' : mood === 'fussy' ? '?' : mood === 'calm' ? '.' : pick(rand, ['!', '…', '?', '.'] as const);

  if (rand() < 0.45) {
    return `${opener}! ${capitalize(body)}${endPunct}`;
  }
  return `${opener}! ${body}${endPunct}`;
}
