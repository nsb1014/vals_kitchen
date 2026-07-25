import { colorForItemKey } from '../canvas/item-colors.ts';

/** Maps placement itemKey to furniture atlas sprite name. */
export function spriteNameForItemKey(itemKey: string): string {
  if (itemKey.startsWith('table')) return 'table_2seat';
  if (itemKey.startsWith('decor')) return 'decor_plant';
  return itemKey;
}

/** Graphics tint when atlas texture is unavailable. */
export function fallbackTintForItemKey(itemKey: string): number {
  return colorForItemKey(itemKey);
}
