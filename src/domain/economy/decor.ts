export const DECOR_ITEM_KEYS = [
  'decor_plant',
  'decor_flowers',
  'decor_rug',
  'decor_lamp',
  'decor_sign',
] as const;

export type DecorItemKey = (typeof DECOR_ITEM_KEYS)[number];
export type DecorPurchasedCounts = Record<DecorItemKey, number>;

export const DECOR_COSTS: Readonly<Record<DecorItemKey, number>> = {
  decor_plant: 50,
  decor_flowers: 75,
  decor_rug: 120,
  decor_lamp: 150,
  decor_sign: 200,
};

/** Maximum decorations that can be owned or placed on the main floor. */
export const MAX_DECOR_PLACEMENTS = 6;

export function isDecorItemKey(itemKey: string): itemKey is DecorItemKey {
  return (DECOR_ITEM_KEYS as readonly string[]).includes(itemKey);
}

/** Rugs are floor surfaces; every freestanding décor prop occupies its tile. */
export function isWalkBlockingDecorItemKey(itemKey: string): itemKey is DecorItemKey {
  return isDecorItemKey(itemKey) && itemKey !== 'decor_rug';
}

export function createEmptyDecorPurchasedCounts(): DecorPurchasedCounts {
  return {
    decor_plant: 0,
    decor_flowers: 0,
    decor_rug: 0,
    decor_lamp: 0,
    decor_sign: 0,
  };
}

export function decorPurchasedTotal(counts: DecorPurchasedCounts): number {
  return DECOR_ITEM_KEYS.reduce((total, itemKey) => total + counts[itemKey], 0);
}

export function decorPurchasedCountsFromPlacements(
  placements: ReadonlyArray<{ itemKey: string }>,
): DecorPurchasedCounts {
  const counts = createEmptyDecorPurchasedCounts();
  for (const placement of placements) {
    if (isDecorItemKey(placement.itemKey)) {
      counts[placement.itemKey] += 1;
    }
  }
  return counts;
}

export function normalizeDecorPurchasedCounts(
  raw: Partial<Record<DecorItemKey, number>> | null | undefined,
  placements: ReadonlyArray<{ itemKey: string }>,
): DecorPurchasedCounts {
  const placedCounts = decorPurchasedCountsFromPlacements(placements);
  const counts = createEmptyDecorPurchasedCounts();
  for (const itemKey of DECOR_ITEM_KEYS) {
    const saved = raw?.[itemKey];
    const normalizedSaved =
      typeof saved === 'number' && Number.isFinite(saved)
        ? Math.max(0, Math.floor(saved))
        : 0;
    counts[itemKey] = Math.max(normalizedSaved, placedCounts[itemKey]);
  }
  return counts;
}
