import type { DomainContext } from './context.ts';
import { generateDay } from './day/generate.ts';
import {
  advanceCustomer,
  closeDay,
  isDayComplete,
  serveCustomer,
} from './day/serve.ts';
import {
  applyMoveItem,
  applyPlaceItem,
  applyPurchase,
  applyRemoveItem,
  type PurchaseKind,
} from './economy/purchases.ts';
import type { GameState, Placement } from './state/game-state.ts';
import { cloneGameState } from './state/game-state.ts';

export type GameAction =
  | { type: 'OPEN_DAY' }
  | { type: 'SET_COMPOSE_DRAFT'; ingredientIds: string[] }
  | { type: 'SERVE_DISH'; ingredientIds: string[] }
  | { type: 'NEXT_CUSTOMER' }
  | { type: 'CLOSE_DAY' }
  | { type: 'PURCHASE'; purchase: PurchaseKind }
  | { type: 'PLACE_ITEM'; placement: Placement }
  | { type: 'REMOVE_ITEM'; placementId: string }
  | { type: 'MOVE_ITEM'; placementId: string; x: number; y: number };

export interface ReducerResult {
  state: GameState;
  events: ReducerEvent[];
}

export type ReducerEvent =
  | { type: 'PRESTIGE_TRIGGERED'; prestige: number }
  | { type: 'SOFT_RESET_TRIGGERED' }
  | { type: 'RECIPE_DISCOVERED'; recipeId: string; recipeName: string }
  | { type: 'CUSTOMER_SERVED'; matchStars: number; tip: number; ratingDelta: number };

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
      const next = cloneGameState(state);
      next.activeDay = {
        seed: generated.seed,
        modifierId: generated.modifier.id,
        customers: generated.customers,
        queueIndex: 0,
        dayEarnings: 0,
        dayMatchSum: 0,
        customersServed: 0,
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
      if (result.recipeId && !beforeRecipes.has(result.recipeId)) {
        events.push({
          type: 'RECIPE_DISCOVERED',
          recipeId: result.recipeId,
          recipeName: result.recipeName ?? result.recipeId,
        });
      }
      events.push({
        type: 'CUSTOMER_SERVED',
        matchStars: result.matchStars,
        tip: result.tip,
        ratingDelta: result.ratingDelta,
      });
      if (result.prestigeTriggered) {
        events.push({ type: 'PRESTIGE_TRIGGERED', prestige: result.state.prestige });
      }
      if (result.softResetTriggered) {
        events.push({ type: 'SOFT_RESET_TRIGGERED' });
      }
      return { state: result.state, events };
    }

    case 'NEXT_CUSTOMER': {
      if (!state.activeDay) throw new Error('No active service day');
      if (state.activeDay.queueIndex >= state.activeDay.customers.length - 1) {
        throw new Error('No more customers in queue');
      }
      return { state: advanceCustomer(state), events };
    }

    case 'CLOSE_DAY': {
      return { state: closeDay(state), events };
    }

    case 'PURCHASE': {
      return { state: applyPurchase(state, action.purchase, ctx), events };
    }

    case 'PLACE_ITEM': {
      return { state: applyPlaceItem(state, action.placement), events };
    }

    case 'REMOVE_ITEM': {
      return { state: applyRemoveItem(state, action.placementId), events };
    }

    case 'MOVE_ITEM': {
      return {
        state: applyMoveItem(state, action.placementId, action.x, action.y),
        events,
      };
    }

    default: {
      const _exhaustive: never = action;
      throw new Error(`Unknown action: ${String(_exhaustive)}`);
    }
  }
}

export { isDayComplete };
