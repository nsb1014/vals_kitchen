import { describe, expect, it } from 'vitest';
import { deliverAndScore } from '../../domain/floor/deliver.ts';
import {
  createFloorDayFromCustomers,
  seatNextWaiting,
  tablesFromPlacements,
  takeOrdersForSeated,
} from '../../domain/floor/sim.ts';
import { plateTicket } from '../../domain/floor/tickets.ts';
import { setTable } from '../../domain/floor/tables.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import type { Customer } from '../../domain/day/types.ts';
import type { CustomerPreference } from '../../domain/types.ts';
import { createNewGameState } from '../../domain/state/game-state.ts';
import type { ActiveDay } from '../../domain/day/types.ts';
import { testContext } from '../test-helpers.ts';
import { findBestMatchCombo } from '../../domain/day/customer-request-generator.ts';

const pref = (): CustomerPreference => ({
  primary: { UM: 'high' },
  avoid: {},
  phrases: ['savory'],
});

function customer(id: string): Customer {
  return { id, archetypeId: 'test', preference: pref() };
}

function floorStateWithPlatedTicket() {
  const placements = [
    { id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
  ];
  const tables = tablesFromPlacements(placements).map(setTable);
  const seats = seatsFromPlacements(placements);
  const c = customer('c1');
  let floor = createFloorDayFromCustomers([c], tables, seats);
  floor = seatNextWaiting(floor);
  floor = takeOrdersForSeated(floor, ['c1']);
  const ticketId = floor.tickets[0]!.id;
  const best = findBestMatchCombo(
    createNewGameState(1).unlockedIngredientIds,
    c.preference,
    testContext.ingredientsById,
    testContext.compoundAffinity,
  );
  const plated = plateTicket(floor.tickets, ticketId, best.ingredientIds.slice(0, 3));
  floor = { ...floor, tickets: plated.tickets, carriedTicketId: plated.carriedTicketId };

  const state = createNewGameState(42);
  const activeDay: ActiveDay = {
    seed: 1,
    modifierId: 'none',
    customers: [c],
    queueIndex: 0,
    dayEarnings: 0,
    dayMatchSum: 0,
    customersServed: 0,
    floor,
  };
  state.activeDay = activeDay;
  return { state, ticketId, c };
}

describe('deliverAndScore', () => {
  it('scores plated ticket, pays cash, and starts eating', () => {
    const { state, ticketId } = floorStateWithPlatedTicket();
    const cashBefore = state.cash;

    const result = deliverAndScore(state, ticketId, testContext);

    expect(result.matchStars).toBeGreaterThan(0);
    expect(result.state.cash).toBeGreaterThan(cashBefore);
    expect(result.state.activeDay!.customersServed).toBe(1);
    const guest = result.state.activeDay!.floor!.pool[0]!;
    expect(guest.stage).toBe('eating');
    expect(guest.eatTicksRemaining).toBe(3);
    expect(result.state.activeDay!.floor!.carriedTicketId).toBeNull();
    expect(result.state.activeDay!.floor!.tickets[0]!.status).toBe('delivered');
  });

  it('returns mastery metadata when a named recipe matches', () => {
    const recipe = testContext.recipes.find((r) => r.id === 'recipe_0413')!;
    const { state, ticketId } = floorStateWithPlatedTicket();
    const floor = state.activeDay!.floor!;
    state.activeDay = {
      ...state.activeDay!,
      floor: {
        ...floor,
        tickets: floor.tickets.map((t) =>
          t.id === ticketId
            ? { ...t, status: 'plated' as const, ingredientIds: [...recipe.ingredientIds] }
            : t,
        ),
      },
    };

    const result = deliverAndScore(state, ticketId, testContext);

    expect(result.recipeId).toBe(recipe.id);
    expect(result.masteryLevel).toBe(1);
    expect(result.masteryLeveledUp).toBe(true);
    expect(result.masteryBonusApplied).toBe(0);
  });

  it('refuses wrong ticket status', () => {
    const { state } = floorStateWithPlatedTicket();
    const openId = state.activeDay!.floor!.tickets[0]!.id;
    const openFloor = {
      ...state.activeDay!.floor!,
      tickets: state.activeDay!.floor!.tickets.map((t) => ({ ...t, status: 'open' as const })),
    };
    state.activeDay = { ...state.activeDay!, floor: openFloor };
    expect(() => deliverAndScore(state, openId, testContext)).toThrow(/plated/i);
  });

  it('refuses guest not in ordered stage', () => {
    const { state, ticketId } = floorStateWithPlatedTicket();
    const seatedFloor = {
      ...state.activeDay!.floor!,
      pool: state.activeDay!.floor!.pool.map((g) => ({ ...g, stage: 'seated' as const })),
    };
    state.activeDay = { ...state.activeDay!, floor: seatedFloor };
    expect(() => deliverAndScore(state, ticketId, testContext)).toThrow(/ready for delivery/i);
  });
});
