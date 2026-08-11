import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../domain/state/game-state.ts';
import {
  buildShopMilestoneStrip,
  buildEquipmentShopRows,
  purchaseFeedbackMessage,
  shopRowDescription,
  shopRowActionLabel,
} from '../ui/presentation/shop-items.ts';
import { testContext } from './test-helpers.ts';
import equipment from '../data/equipment.json';

describe('meta shop milestone + purchase copy', () => {
  it('surfaces the next equipment unlock with ingredient count', () => {
    const state = createNewGameState(11);
    state.cash = 50;
    const rows = buildEquipmentShopRows(state, equipment, testContext);
    const strip = buildShopMilestoneStrip(state, rows, testContext.ingredients);
    expect(strip.kind).toBe('equipment');
    expect(strip.text).toMatch(/^Next: /);
    expect(strip.text).toMatch(/unlocks \d+ ingredients?/);
  });

  it('falls back to prestige distance when equipment is fully owned', () => {
    const state = createNewGameState(11);
    state.purchasedEquipmentIds = equipment
      .filter((item) => item.purchaseIndex !== null)
      .map((item) => item.id);
    state.rating = 4.2;
    const rows = buildEquipmentShopRows(state, equipment, testContext);
    const strip = buildShopMilestoneStrip(state, rows, testContext.ingredients);
    expect(strip.kind).toBe('prestige');
    expect(strip.text).toContain('to prestige');
  });

  it('keeps purchase feedback actionable for placeable vs pantry items', () => {
    expect(
      purchaseFeedbackMessage({
        kind: 'ingredient',
        id: 'lemon',
        name: 'Lemon',
        category: 'produce',
        equipmentGateName: 'Prep Station',
        cost: 10,
        availability: 'available',
        purchase: { type: 'ingredient', ingredientId: 'lemon' },
      }),
    ).toBe('Purchased Lemon');
    expect(
      purchaseFeedbackMessage({
        kind: 'equipment',
        id: 'oven',
        name: 'Oven',
        groupName: 'Baked',
        cost: 450,
        availability: 'available',
        purchase: { type: 'equipment', equipmentId: 'oven' },
      }),
    ).toContain('place on the floor');
    expect(
      shopRowActionLabel({ kind: 'table', availability: 'available' }),
    ).toBe('Buy & place');
    expect(
      shopRowDescription({
        kind: 'ingredient',
        id: 'lemon',
        name: 'Lemon',
        category: 'produce',
        equipmentGateName: 'Oven',
        cost: 10,
        availability: 'gate_locked',
        purchase: { type: 'ingredient', ingredientId: 'lemon' },
      }),
    ).toBe('Requires Oven');
  });
});
