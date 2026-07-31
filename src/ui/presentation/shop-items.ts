import {
  canPurchase,
  DECOR_ITEM_KEYS,
  MAX_DECOR_PLACEMENTS,
  purchaseCost,
  type DecorItemKey,
  type PurchaseKind,
} from '../../domain/economy/purchases.ts';
import { decorPurchasedTotal } from '../../domain/economy/decor.ts';
import type { DomainContext } from '../../domain/context.ts';
import type { GameState } from '../../domain/state/game-state.ts';
import { MAX_GRID_SIZE } from '../../domain/state/game-state.ts';
import type { Ingredient } from '../../domain/types.ts';
import { formatCurrency } from './review-display.ts';

export type ShopItemAvailability =
  'owned' | 'gate_locked' | 'unaffordable' | 'limit_reached' | 'available';

export interface ShopEquipmentRow {
  kind: 'equipment';
  id: string;
  name: string;
  groupName: string;
  cost: number;
  availability: ShopItemAvailability;
  purchase: PurchaseKind;
}

export interface ShopIngredientRow {
  kind: 'ingredient';
  id: string;
  name: string;
  category: string;
  equipmentGateName: string;
  cost: number;
  availability: ShopItemAvailability;
  purchase: PurchaseKind;
}

export interface ShopUtilityRow {
  kind: 'table' | 'decor' | 'grid_expansion' | 'kitchen_annex';
  id: string;
  name: string;
  description: string;
  cost: number;
  availability: ShopItemAvailability;
  purchase: PurchaseKind;
}

export type ShopRow = ShopEquipmentRow | ShopIngredientRow | ShopUtilityRow;

const DECOR_NAMES: Readonly<Record<DecorItemKey, string>> = {
  decor_plant: 'Plant',
  decor_flowers: 'Flowers',
  decor_rug: 'Rug',
  decor_lamp: 'Lamp',
  decor_sign: 'Wall Sign',
};

function deriveAvailability(
  state: GameState,
  purchase: PurchaseKind,
  ctx: DomainContext,
  gateLocked: boolean,
): ShopItemAvailability {
  if (gateLocked) return 'gate_locked';
  if (purchase.type === 'ingredient' && state.unlockedIngredientIds.includes(purchase.ingredientId)) {
    return 'owned';
  }
  if (purchase.type === 'equipment' && state.purchasedEquipmentIds.includes(purchase.equipmentId)) {
    return 'owned';
  }
  if (purchase.type === 'kitchen_annex' && state.kitchenAnnexOwned) {
    return 'owned';
  }
  if (canPurchase(state, purchase, ctx)) return 'available';
  if (purchase.type === 'grid_expansion') {
    if (state.gridSize.w >= MAX_GRID_SIZE && state.gridSize.h >= MAX_GRID_SIZE) {
      return 'owned';
    }
  }
  return 'unaffordable';
}

export function buildEquipmentShopRows(
  state: GameState,
  equipmentCatalog: Array<{ id: string; name: string; ingredientGroupName: string; purchaseIndex: number | null }>,
  ctx: DomainContext,
): ShopEquipmentRow[] {
  return equipmentCatalog
    .filter((item) => item.purchaseIndex !== null)
    .map((item) => {
      const purchase: PurchaseKind = { type: 'equipment', equipmentId: item.id };
      const cost = purchaseCost(state, purchase);
      const owned = state.purchasedEquipmentIds.includes(item.id);
      return {
        kind: 'equipment' as const,
        id: item.id,
        name: item.name,
        groupName: item.ingredientGroupName,
        cost: owned ? 0 : cost,
        availability: owned ? 'owned' : deriveAvailability(state, purchase, ctx, false),
        purchase,
      };
    });
}

export function buildIngredientShopRows(
  state: GameState,
  ingredients: Ingredient[],
  equipmentNameById: Map<string, string>,
  ctx: DomainContext,
): ShopIngredientRow[] {
  const availabilityOrder: Record<ShopItemAvailability, number> = {
    owned: 0,
    available: 1,
    unaffordable: 2,
    gate_locked: 3,
    limit_reached: 4,
  };
  return ingredients
    .map((item) => {
      const gateOwned = state.purchasedEquipmentIds.includes(item.equipmentId);
      const purchase: PurchaseKind = { type: 'ingredient', ingredientId: item.id };
      const owned = state.unlockedIngredientIds.includes(item.id);
      return {
        kind: 'ingredient' as const,
        id: item.id,
        name: item.name,
        category: item.category,
        equipmentGateName: equipmentNameById.get(item.equipmentId) ?? item.equipmentId,
        cost: owned ? 0 : purchaseCost(state, purchase),
        availability: owned
          ? 'owned' as const
          : deriveAvailability(state, purchase, ctx, !gateOwned),
        purchase,
      };
    })
    .sort(
      (left, right) =>
        availabilityOrder[left.availability] -
          availabilityOrder[right.availability] ||
        left.name.localeCompare(right.name),
    );
}

export function buildUtilityShopRows(state: GameState, ctx: DomainContext): ShopUtilityRow[] {
  const gridMaxed = state.gridSize.w >= MAX_GRID_SIZE && state.gridSize.h >= MAX_GRID_SIZE;
  const nextW = Math.min(MAX_GRID_SIZE, state.gridSize.w + 1);
  const nextH = Math.min(MAX_GRID_SIZE, state.gridSize.h + 1);

  const tablePurchase: PurchaseKind = { type: 'table' };
  const gridPurchase: PurchaseKind = { type: 'grid_expansion' };
  const annexPurchase: PurchaseKind = { type: 'kitchen_annex' };

  const decorAtCap = decorPurchasedTotal(state.decorPurchasedCounts) >= MAX_DECOR_PLACEMENTS;
  const decorRows: ShopUtilityRow[] = DECOR_ITEM_KEYS.map((itemKey) => {
    const purchase: PurchaseKind = { type: 'decor', itemKey };
    return {
      kind: 'decor',
      id: `decor:${itemKey}`,
      name: DECOR_NAMES[itemKey],
      description: 'A cosmetic decoration for the dining room.',
      cost: purchaseCost(state, purchase),
      availability: decorAtCap ? 'limit_reached' : deriveAvailability(state, purchase, ctx, false),
      purchase,
    };
  });

  return [
    {
      kind: 'table',
      id: 'table',
      name: 'Table (2 seats)',
      description: 'Adds a placeable table for more customers per day.',
      cost: purchaseCost(state, tablePurchase),
      availability: deriveAvailability(state, tablePurchase, ctx, false),
      purchase: tablePurchase,
    },
    ...decorRows,
    {
      kind: 'grid_expansion',
      id: 'grid_expansion',
      name: 'Expand Grid',
      description: `Grow floor to ${nextW}×${nextH} (max ${MAX_GRID_SIZE}×${MAX_GRID_SIZE}).`,
      cost: purchaseCost(state, gridPurchase),
      availability: gridMaxed
        ? 'owned'
        : deriveAvailability(state, gridPurchase, ctx, false),
      purchase: gridPurchase,
    },
    {
      kind: 'kitchen_annex',
      id: 'kitchen_annex',
      name: 'Back Kitchen Annex',
      description:
        'Unlock a same-size back kitchen through a connecting door — more station space without widening the map.',
      cost: purchaseCost(state, annexPurchase),
      availability: state.kitchenAnnexOwned
        ? 'owned'
        : deriveAvailability(state, annexPurchase, ctx, false),
      purchase: annexPurchase,
    },
  ];
}

export function shopAvailabilityLabel(availability: ShopItemAvailability): string {
  switch (availability) {
    case 'owned':
      return 'Owned';
    case 'gate_locked':
      return 'Needs equipment';
    case 'unaffordable':
      return 'Not enough cash';
    case 'limit_reached':
      return 'Limit reached';
    case 'available':
      return 'Buy';
  }
}

export function shopAvailabilityClass(availability: ShopItemAvailability): string {
  return `shop-item-${availability}`;
}

export function formatShopCost(cost: number, availability: ShopItemAvailability): string {
  if (availability === 'owned') return 'Owned';
  if (availability === 'gate_locked') return 'Locked';
  return formatCurrency(cost);
}
