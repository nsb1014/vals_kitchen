import { findMatchingRecipe } from '../flavor/recipe-match.ts';
import type { DomainContext } from '../context.ts';
import {
  scoreAndPayForCustomer,
  type ServeResult,
} from '../day/serve.ts';
import {
  applyMasteryServe,
  masteryBonusStars,
} from './mastery.ts';
import { beginEating } from './sim.ts';
import { deliverTicket } from './tickets.ts';
import type { GameState } from '../state/game-state.ts';
import { cloneGameState } from '../state/game-state.ts';

export function deliverAndScore(
  state: GameState,
  ticketId: string,
  ctx: DomainContext,
  eatTicks = 3,
): ServeResult {
  const activeDay = state.activeDay;
  if (!activeDay?.floor) {
    throw new Error('No active floor day');
  }

  const ticket = activeDay.floor.tickets.find((t) => t.id === ticketId);
  if (!ticket) {
    throw new Error(`Unknown ticket: ${ticketId}`);
  }
  if (ticket.status !== 'plated') {
    throw new Error(`Ticket not plated: ${ticket.status}`);
  }

  const guest = activeDay.floor.pool.find((g) => g.customer.id === ticket.customerId);
  if (!guest) {
    throw new Error(`Guest not found for ticket: ${ticketId}`);
  }
  if (!guest.seat) {
    throw new Error('Guest has no seat');
  }
  if (guest.stage !== 'ordered') {
    throw new Error(`Guest not ready for delivery: ${guest.stage}`);
  }

  const recipe = findMatchingRecipe(ticket.ingredientIds, ctx.recipes);
  const masteryLevel = recipe ? (state.recipeMastery[recipe.id]?.level ?? 0) : 0;
  const masteryBonus = recipe ? masteryBonusStars(masteryLevel) : 0;

  let result = scoreAndPayForCustomer(
    state,
    guest.customer,
    ticket.ingredientIds,
    ctx,
    { masteryBonus },
  );

  if (recipe) {
    const masteryResult = applyMasteryServe(result.state.recipeMastery, recipe.id);
    result = {
      ...result,
      state: { ...result.state, recipeMastery: masteryResult.mastery },
    };
  }

  if (!result.state.activeDay?.floor) {
    return result;
  }

  let floor = {
    ...result.state.activeDay.floor,
    tickets: deliverTicket(result.state.activeDay.floor.tickets, ticketId),
    carriedTicketId: null as string | null,
  };
  floor = beginEating(floor, guest.customer.id, eatTicks);

  const next = cloneGameState(result.state);
  next.activeDay = { ...next.activeDay!, floor };
  return { ...result, state: next };
}
