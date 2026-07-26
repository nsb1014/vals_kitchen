import { colorForItemKey } from '../canvas/item-colors.ts';
import type { TableSurfaceState } from '../domain/floor/types.ts';

/** Maps domain table surface state to furniture atlas sprite. */
export function spriteNameForTableState(state: TableSurfaceState | null | undefined): string {
  if (state === 'dirty') return 'table_2seat_dirty';
  if (state === 'ready' || state === 'occupied') return 'table_2seat';
  return 'table_2seat_unset';
}

/** Maps placement itemKey to furniture atlas sprite name. */
export function spriteNameForItemKey(
  itemKey: string,
  tableState?: TableSurfaceState | null,
): string {
  if (itemKey.startsWith('table')) return spriteNameForTableState(tableState);
  if (itemKey.startsWith('decor')) return 'decor_plant';
  if (itemKey.startsWith('chair')) return 'chair';
  return itemKey;
}

/** Graphics tint when atlas texture is unavailable. */
export function fallbackTintForItemKey(itemKey: string): number {
  return colorForItemKey(itemKey);
}
