import { canPurchase, kitchenAnnexCost, type PurchaseKind } from '../../domain/economy/purchases.ts';
import { scaledUpgradeCost } from '../../domain/economy/costs.ts';
import type { DomainContext } from '../../domain/context.ts';
import type { GameState } from '../../domain/state/game-state.ts';
import { MAX_GRID_SIZE } from '../../domain/state/game-state.ts';
import type { Ingredient } from '../../domain/types.ts';
import { formatCurrency } from './review-display.ts';

export type ShopItemAvailability = 'owned' | 'gate_locked' | 'unaffordable' | 'available';

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
  kind: 'table' | 'grid_expansion' | 'kitchen_annex';
  id: string;
  name: string;
  description: string;
  cost: number;
  availability: ShopItemAvailability;
  purchase: PurchaseKind;
}

export type ShopRow = ShopEquipmentRow | ShopIngredientRow | ShopUtilityRow;

function purchasedGateCount(state: GameState): number {
  return state.purchasedEquipmentIds.filter((id) => id !== 'prep_station').length;
}

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
  const gateCount = purchasedGateCount(state);
  return equipmentCatalog
    .filter((item) => item.purchaseIndex !== null)
    .map((item) => {
      const purchase: PurchaseKind = { type: 'equipment', equipmentId: item.id };
      const cost = scaledUpgradeCost(500, 1.18, gateCount, state.prestige);
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
  const cost = scaledUpgradeCost(150, 1.14, state.ingredientUnlockIndex, state.prestige);
  return ingredients
    .filter((item) => !state.unlockedIngredientIds.includes(item.id))
    .map((item) => {
      const gateOwned = state.purchasedEquipmentIds.includes(item.equipmentId);
      const purchase: PurchaseKind = { type: 'ingredient', ingredientId: item.id };
      return {
        kind: 'ingredient' as const,
        id: item.id,
        name: item.name,
        category: item.category,
        equipmentGateName: equipmentNameById.get(item.equipmentId) ?? item.equipmentId,
        cost,
        availability: deriveAvailability(state, purchase, ctx, !gateOwned),
        purchase,
      };
    });
}

export function buildUtilityShopRows(state: GameState, ctx: DomainContext): ShopUtilityRow[] {
  const tableCost = scaledUpgradeCost(200, 1.12, state.tableCount, state.prestige);
  const gridCost = scaledUpgradeCost(300, 1.15, state.gridExpansionCount, state.prestige);
  const annexCost = kitchenAnnexCost(state.prestige);
  const gridMaxed = state.gridSize.w >= MAX_GRID_SIZE && state.gridSize.h >= MAX_GRID_SIZE;
  const nextW = Math.min(MAX_GRID_SIZE, state.gridSize.w + 1);
  const nextH = Math.min(MAX_GRID_SIZE, state.gridSize.h + 1);

  const tablePurchase: PurchaseKind = { type: 'table' };
  const gridPurchase: PurchaseKind = { type: 'grid_expansion' };
  const annexPurchase: PurchaseKind = { type: 'kitchen_annex' };

  return [
    {
      kind: 'table',
      id: 'table',
      name: 'Table (2 seats)',
      description: 'Adds a placeable table for more customers per day.',
      cost: tableCost,
      availability: deriveAvailability(state, tablePurchase, ctx, false),
      purchase: tablePurchase,
    },
    {
      kind: 'grid_expansion',
      id: 'grid_expansion',
      name: 'Expand Grid',
      description: `Grow floor to ${nextW}×${nextH} (max ${MAX_GRID_SIZE}×${MAX_GRID_SIZE}).`,
      cost: gridCost,
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
      cost: annexCost,
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
