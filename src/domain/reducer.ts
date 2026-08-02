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
  completeGuestLeaving,
  completeGuestSeating,
  createFloorDayFromCustomers,
  seatNextWaiting,
  tablesFromPlacements,
  takeOrdersForSeated,
  tickEating,
  updateGuestMotionPosition,
} from './floor/sim.ts';
import {
  plateTicket,
  resolveFloorComposeTicket,
  selectFloorTicket,
  setFloorTicketDraft,
} from './floor/tickets.ts';
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
import {
  cloneGameState,
  MAX_DISH_INGREDIENTS,
  MIN_DISH_INGREDIENTS,
} from './state/game-state.ts';
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
  | { type: 'FLOOR_COMPLETE_SEATING'; guestId: string }
  | { type: 'FLOOR_COMPLETE_LEAVING'; guestId: string }
  | {
      type: 'FLOOR_UPDATE_GUEST_MOTION_POSITION';
      guestId: string;
      position: { x: number; y: number };
    }
  | { type: 'FLOOR_TAKE_ORDERS'; customerIds: string[] }
  | { type: 'FLOOR_SELECT_TICKET'; ticketId: string | null }
  | { type: 'FLOOR_SET_TICKET_DRAFT'; ticketId: string; ingredientIds: string[] }
  | { type: 'FLOOR_PLATE'; ticketId: string }
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
      customerId?: string;
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

function assertValidFloorIngredients(
  state: GameState,
  ingredientIds: string[],
  ctx: DomainContext,
  minimum: number,
): void {
  if (
    ingredientIds.length < minimum ||
    ingredientIds.length > MAX_DISH_INGREDIENTS
  ) {
    throw new Error(`Dish requires ${minimum}-${MAX_DISH_INGREDIENTS} ingredients`);
  }
  if (new Set(ingredientIds).size !== ingredientIds.length) {
    throw new Error('Dish ingredients must be unique');
  }
  const unlocked = new Set(state.unlockedIngredientIds);
  for (const ingredientId of ingredientIds) {
    if (!ctx.ingredientsById.has(ingredientId)) {
      throw new Error(`Unknown ingredient: ${ingredientId}`);
    }
    if (!unlocked.has(ingredientId)) {
      throw new Error(`Ingredient is locked: ${ingredientId}`);
    }
  }
}

function serveEvents(
  beforeRecipes: Set<string>,
  result: ReturnType<typeof serveCustomer>,
  events: ReducerEvent[],
  ctx: DomainContext,
  customerId?: string,
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
    ...(customerId ? { customerId } : {}),
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
      if (state.activeDay?.floor) {
        throw new Error('Floor drafts must be saved on their selected ticket');
      }
      const next = cloneGameState(state);
      next.composeDraftIngredientIds = [...action.ingredientIds];
      return { state: next, events };
    }

    case 'SERVE_DISH': {
      const customerId = state.activeDay?.customers[state.activeDay.queueIndex]?.id;
      const beforeRecipes = new Set(state.discoveredRecipeIds);
      const result = serveCustomer(state, action.ingredientIds, ctx);
      return withAchievementEvents(
        serveEvents(beforeRecipes, result, events, ctx, customerId),
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

    case 'FLOOR_COMPLETE_SEATING': {
      const floor = requireFloor(state);
      return { state: withFloor(state, completeGuestSeating(floor, action.guestId)), events };
    }

    case 'FLOOR_COMPLETE_LEAVING': {
      const floor = requireFloor(state);
      return { state: withFloor(state, completeGuestLeaving(floor, action.guestId)), events };
    }

    case 'FLOOR_UPDATE_GUEST_MOTION_POSITION': {
      const floor = requireFloor(state);
      return {
        state: withFloor(
          state,
          updateGuestMotionPosition(floor, action.guestId, action.position),
        ),
        events,
      };
    }

    case 'FLOOR_TAKE_ORDERS': {
      const floor = requireFloor(state);
      return { state: withFloor(state, takeOrdersForSeated(floor, action.customerIds)), events };
    }

    case 'FLOOR_SELECT_TICKET': {
      const floor = requireFloor(state);
      return {
        state: withFloor(state, selectFloorTicket(floor, action.ticketId)),
        events,
      };
    }

    case 'FLOOR_SET_TICKET_DRAFT': {
      const floor = requireFloor(state);
      assertValidFloorIngredients(state, action.ingredientIds, ctx, 0);
      return {
        state: withFloor(
          state,
          setFloorTicketDraft(floor, action.ticketId, action.ingredientIds),
        ),
        events,
      };
    }

    case 'FLOOR_PLATE': {
      const floor = requireFloor(state);
      const ticket = resolveFloorComposeTicket(floor);
      if (!ticket || ticket.id !== action.ticketId) {
        throw new Error(`Ticket is not selected for plating: ${action.ticketId}`);
      }
      assertValidFloorIngredients(
        state,
        ticket.ingredientIds,
        ctx,
        MIN_DISH_INGREDIENTS,
      );
      return {
        state: withFloor(state, plateTicket(floor, action.ticketId)),
        events,
      };
    }

    case 'FLOOR_DELIVER': {
      const ticket = requireFloor(state).tickets.find(
        (candidate) => candidate.id === action.ticketId,
      );
      const beforeRecipes = new Set(state.discoveredRecipeIds);
      const result = deliverAndScore(state, action.ticketId, ctx);
      return withAchievementEvents(
        serveEvents(beforeRecipes, result, events, ctx, ticket?.customerId),
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
