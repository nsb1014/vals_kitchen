import type { DomainContext } from '../../domain/context.ts';
import {
  canPurchase,
  DECOR_ITEM_KEYS,
  MAX_DECOR_PLACEMENTS,
  purchaseCost,
  type DecorItemKey,
  type PurchaseKind,
} from '../../domain/economy/purchases.ts';
import { decorPurchasedTotal } from '../../domain/economy/decor.ts';
import type { GameState } from '../../domain/state/game-state.ts';
import type { GameStore } from '../game-store.ts';

export const selectPlacements = (state: GameStore) => state.placements;
export const selectGridSize = (state: GameStore) => state.gridSize;
export const selectEditLayoutMode = (state: GameStore) => state.editLayoutMode;
export const selectSeatingCapacity = (state: GameStore) => state.seatingCapacity;

export function selectShowLayoutHud(
  state: Pick<GameStore, 'screen' | 'activeDay' | 'daySummary' | 'editLayoutMode'>,
): boolean {
  return (
    state.screen === 'restaurant' && !state.activeDay && !state.daySummary && state.editLayoutMode
  );
}

export const DECOR_DISPLAY_NAMES: Readonly<Record<DecorItemKey, string>> = {
  decor_plant: 'Plant',
  decor_flowers: 'Flowers',
  decor_rug: 'Rug',
  decor_lamp: 'Lamp',
  decor_sign: 'Menu Sign',
};

export type LayoutCatalogAvailability = 'available' | 'unaffordable' | 'cap_reached';

export interface LayoutCatalogRow {
  kind: 'table' | 'decor';
  itemKey: 'table_2seat' | DecorItemKey;
  label: string;
  cost: number;
  availability: LayoutCatalogAvailability;
  purchase: PurchaseKind;
}

export function buildLayoutCatalogRows(state: GameState, ctx: DomainContext): LayoutCatalogRow[] {
  const tablePurchase: PurchaseKind = { type: 'table' };
  const tableRow: LayoutCatalogRow = {
    kind: 'table',
    itemKey: 'table_2seat',
    label: 'Table (2 seats)',
    cost: purchaseCost(state, tablePurchase),
    availability: canPurchase(state, tablePurchase, ctx) ? 'available' : 'unaffordable',
    purchase: tablePurchase,
  };
  const decorAtCap = decorPurchasedTotal(state.decorPurchasedCounts) >= MAX_DECOR_PLACEMENTS;
  const decorRows = DECOR_ITEM_KEYS.map((itemKey): LayoutCatalogRow => {
    const purchase: PurchaseKind = { type: 'decor', itemKey };
    return {
      kind: 'decor',
      itemKey,
      label: DECOR_DISPLAY_NAMES[itemKey],
      cost: purchaseCost(state, purchase),
      availability: decorAtCap
        ? 'cap_reached'
        : canPurchase(state, purchase, ctx)
          ? 'available'
          : 'unaffordable',
      purchase,
    };
  });

  return [tableRow, ...decorRows];
}
