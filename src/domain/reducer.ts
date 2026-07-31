import type { DomainContext } from './context.ts';
import { generateDay } from './day/generate.ts';
import {
  advanceCustomer,
  closeDay,
  isDayComplete,
  serveCustomer,
} from './day/serve.ts';
import { deliverAndScore } from './floor/deliver.ts';
import {
  completeGuestEntering,
  createFloorDayFromCustomers,
  seatNextWaiting,
  tablesFromPlacements,
  takeOrdersForSeated,
  tickEating,
} from './floor/sim.ts';
import { plateTicket } from './floor/tickets.ts';
import { clearTable, setTable } from './floor/tables.ts';
import { seatsFromPlacements } from './floor/seats.ts';
import {
  applyMoveItem,
  applyPlaceItem,
  applyPurchase,
  applyRemoveItem,
  applyTransferItemRoom,
  type PurchaseKind,
} from './economy/purchases.ts';
import { servicePlayerSpawn, type FloorRoomId } from './floor/starter-map.ts';
import type { GameState, Placement } from './state/game-state.ts';
import { cloneGameState } from './state/game-state.ts';
import { applyAchievementUnlocks } from './achievements/evaluate.ts';
import type { AchievementId } from './achievements/catalog.ts';

export type GameAction =
  | { type: 'OPEN_DAY' }
  | { type: 'SET_COMPOSE_DRAFT'; ingredientIds: string[] }
  | { type: 'SERVE_DISH'; ingredientIds: string[] }
  | { type: 'NEXT_CUSTOMER' }
  | { type: 'CLOSE_DAY' }
  | { type: 'PURCHASE'; purchase: PurchaseKind }
  | { type: 'PLACE_ITEM'; placement: Placement; room?: FloorRoomId }
  | { type: 'REMOVE_ITEM'; placementId: string }
  | { type: 'MOVE_ITEM'; placementId: string; x: number; y: number; room?: FloorRoomId }
  | {
      type: 'TRANSFER_ITEM_ROOM';
      placementId: string;
      fromRoom: FloorRoomId;
      toRoom: FloorRoomId;
      x: number;
      y: number;
    }
  | { type: 'FLOOR_SET_TABLE'; placementId: string }
  | { type: 'FLOOR_CLEAR_TABLE'; placementId: string }
  | { type: 'FLOOR_SEAT_NEXT' }
  | { type: 'FLOOR_COMPLETE_ENTERING' }
  | { type: 'FLOOR_TAKE_ORDERS'; customerIds: string[] }
  | { type: 'FLOOR_PLATE'; ticketId: string; ingredientIds: string[] }
  | { type: 'FLOOR_DELIVER'; ticketId: string }
  | { type: 'FLOOR_TICK_EATING' };

export interface ReducerResult {
  state: GameState;
  events: ReducerEvent[];
}

export type ReducerEvent =
  | { type: 'PRESTIGE_TRIGGERED'; prestige: number }
  | { type: 'SOFT_RESET_TRIGGERED' }
  | {
      type: 'ACHIEVEMENT_UNLOCKED';
      achievementId: AchievementId;
      title: string;
      body: string;
    }
  | {
      type: 'RECIPE_DISCOVERED';
      recipeId: string;
      recipeName: string;
      ingredientIds: string[];
    }
  | {
      type: 'CUSTOMER_SERVED';
      matchStars: number;
      tip: number;
      ratingDelta: number;
      recipeId?: string;
      recipeName?: string;
      ingredientIds?: string[];
      masteryLevel?: number;
      masteryLeveledUp?: boolean;
      masteryBonus?: number;
    };

function requireFloor(state: GameState) {
  if (!state.activeDay?.floor) {
    throw new Error('No active floor day');
  }
  return state.activeDay.floor;
}

function withFloor(state: GameState, floor: NonNullable<GameState['activeDay']>['floor']) {
  const next = cloneGameState(state);
  next.activeDay = { ...next.activeDay!, floor };
  return next;
}

function serveEvents(
  beforeRecipes: Set<string>,
  result: ReturnType<typeof serveCustomer>,
  events: ReducerEvent[],
  ctx: DomainContext,
): ReducerResult {
  const recipe = result.recipeId
    ? ctx.recipes.find((item) => item.id === result.recipeId)
    : undefined;
  if (result.recipeId && !beforeRecipes.has(result.recipeId)) {
    events.push({
      type: 'RECIPE_DISCOVERED',
      recipeId: result.recipeId,
      recipeName: result.recipeName ?? result.recipeId,
      ingredientIds: recipe?.ingredientIds ?? [],
    });
  }
  events.push({
    type: 'CUSTOMER_SERVED',
    matchStars: result.matchStars,
    tip: result.tip,
    ratingDelta: result.ratingDelta,
    ...(result.recipeId
      ? {
          recipeId: result.recipeId,
          recipeName: result.recipeName ?? result.recipeId,
          ingredientIds: recipe?.ingredientIds ?? [],
        }
      : {}),
    ...(result.masteryLevel !== undefined
      ? {
          masteryLevel: result.masteryLevel,
          masteryLeveledUp: result.masteryLeveledUp,
          masteryBonus: result.masteryBonusApplied,
        }
      : {}),
  });
  if (result.prestigeTriggered) {
    events.push({ type: 'PRESTIGE_TRIGGERED', prestige: result.state.prestige });
  }
  if (result.softResetTriggered) {
    events.push({ type: 'SOFT_RESET_TRIGGERED' });
  }
  return { state: result.state, events };
}

function withAchievementEvents(result: ReducerResult): ReducerResult {
  const achievementResult = applyAchievementUnlocks(result.state);
  if (achievementResult.unlocked.length === 0) return result;
  return {
    state: achievementResult.state,
    events: [
      ...result.events,
      ...achievementResult.unlocked.map(
        (achievement): ReducerEvent => ({
          type: 'ACHIEVEMENT_UNLOCKED',
          achievementId: achievement.id,
          title: achievement.title,
          body: achievement.description,
        }),
      ),
    ],
  };
}

export function gameReducer(
  state: GameState,
  action: GameAction,
  ctx: DomainContext,
): ReducerResult {
  const events: ReducerEvent[] = [];

  switch (action.type) {
    case 'OPEN_DAY': {
      if (state.activeDay) {
        throw new Error('A service day is already open');
      }
      const generated = generateDay(
        {
          globalRunSeed: state.globalRunSeed,
          day: state.day,
          prestige: state.prestige,
          rating: state.rating,
          seatingCapacity: state.seatingCapacity,
          unlockedIngredientIds: state.unlockedIngredientIds,
        },
        ctx,
      );
      const tables = tablesFromPlacements(state.placements);
      const seats = seatsFromPlacements(state.placements);
      const floor = createFloorDayFromCustomers(
        generated.customers,
        tables,
        seats,
        servicePlayerSpawn(state.gridSize.w, state.gridSize.h),
      );
      const next = cloneGameState(state);
      next.activeDay = {
        seed: generated.seed,
        modifierId: generated.modifier.id,
        customers: generated.customers,
        queueIndex: 0,
        dayEarnings: 0,
        dayMatchSum: 0,
        dayRatingDelta: 0,
        ratingResetOccurred: false,
        customersServed: 0,
        floor,
      };
      next.composeDraftIngredientIds = undefined;
      return { state: next, events };
    }

    case 'SET_COMPOSE_DRAFT': {
      const next = cloneGameState(state);
      next.composeDraftIngredientIds = [...action.ingredientIds];
      return { state: next, events };
    }

    case 'SERVE_DISH': {
      const beforeRecipes = new Set(state.discoveredRecipeIds);
      const result = serveCustomer(state, action.ingredientIds, ctx);
      return withAchievementEvents(
        serveEvents(beforeRecipes, result, events, ctx),
      );
    }

    case 'NEXT_CUSTOMER': {
      if (!state.activeDay) throw new Error('No active service day');
      if (state.activeDay.queueIndex >= state.activeDay.customers.length - 1) {
        throw new Error('No more customers in queue');
      }
      return { state: advanceCustomer(state), events };
    }

    case 'CLOSE_DAY': {
      return withAchievementEvents({ state: closeDay(state), events });
    }

    case 'PURCHASE': {
      return withAchievementEvents({
        state: applyPurchase(state, action.purchase, ctx),
        events,
      });
    }

    case 'PLACE_ITEM': {
      if (state.activeDay) {
        throw new Error('Cannot edit layout during service');
      }
      return {
        state: applyPlaceItem(state, action.placement, action.room ?? 'main'),
        events,
      };
    }

    case 'REMOVE_ITEM': {
      if (state.activeDay) {
        throw new Error('Cannot edit layout during service');
      }
      return { state: applyRemoveItem(state, action.placementId), events };
    }

    case 'MOVE_ITEM': {
      if (state.activeDay) {
        throw new Error('Cannot edit layout during service');
      }
      return {
        state: applyMoveItem(
          state,
          action.placementId,
          action.x,
          action.y,
          action.room ?? 'main',
        ),
        events,
      };
    }

    case 'TRANSFER_ITEM_ROOM': {
      if (state.activeDay) {
        throw new Error('Cannot edit layout during service');
      }
      return {
        state: applyTransferItemRoom(
          state,
          action.placementId,
          action.fromRoom,
          action.toRoom,
          action.x,
          action.y,
        ),
        events,
      };
    }

    case 'FLOOR_SET_TABLE': {
      const floor = requireFloor(state);
      const tables = floor.tables.map((t) =>
        t.placementId === action.placementId ? setTable(t) : t,
      );
      return { state: withFloor(state, { ...floor, tables }), events };
    }

    case 'FLOOR_CLEAR_TABLE': {
      const floor = requireFloor(state);
      const tables = floor.tables.map((t) =>
        t.placementId === action.placementId ? clearTable(t) : t,
      );
      return { state: withFloor(state, { ...floor, tables }), events };
    }

    case 'FLOOR_SEAT_NEXT': {
      const floor = requireFloor(state);
      return { state: withFloor(state, seatNextWaiting(floor)), events };
    }

    case 'FLOOR_COMPLETE_ENTERING': {
      const floor = requireFloor(state);
      return { state: withFloor(state, completeGuestEntering(floor)), events };
    }

    case 'FLOOR_TAKE_ORDERS': {
      const floor = requireFloor(state);
      return { state: withFloor(state, takeOrdersForSeated(floor, action.customerIds)), events };
    }

    case 'FLOOR_PLATE': {
      const floor = requireFloor(state);
      const plated = plateTicket(floor.tickets, action.ticketId, action.ingredientIds);
      return {
        state: withFloor(state, {
          ...floor,
          tickets: plated.tickets,
          carriedTicketId: plated.carriedTicketId,
          selectedTicketId: null,
        }),
        events,
      };
    }

    case 'FLOOR_DELIVER': {
      const beforeRecipes = new Set(state.discoveredRecipeIds);
      const result = deliverAndScore(state, action.ticketId, ctx);
      return withAchievementEvents(
        serveEvents(beforeRecipes, result, events, ctx),
      );
    }

    case 'FLOOR_TICK_EATING': {
      const floor = requireFloor(state);
      return { state: withFloor(state, tickEating(floor)), events };
    }

    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown action: ${String(_exhaustive)}`);
    }
  }
}

export { isDayComplete };
