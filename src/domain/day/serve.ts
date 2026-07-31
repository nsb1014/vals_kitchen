import { aggregateDish } from '../flavor/aggregate.ts';
import { findMatchingRecipe, RECIPE_MATCH_BONUS } from '../flavor/recipe-match.ts';
import { computeMatchStars } from '../flavor/scoring.ts';
import { computeTip, dayBonusEarnings, volumeBonusEarnings } from '../economy/tips.ts';
import { prestigeRatingDeltaMultiplier } from '../balance/prestige-pacing.ts';
import { applyReview } from '../rating/update.ts';
import { applyPrestige } from '../rating/prestige.ts';
import { applySoftReset } from '../rating/soft-reset.ts';
import type { DomainContext } from '../context.ts';
import type { GameState } from '../state/game-state.ts';
import { cloneGameState } from '../state/game-state.ts';
import type { ActiveDay, Customer } from './types.ts';
import { applyModifierEffects } from './modifiers.ts';
import { isFloorDayComplete } from '../floor/sim.ts';

export interface ServeResult {
  state: GameState;
  matchStars: number;
  tip: number;
  ratingDelta: number;
  recipeId: string | null;
  recipeName: string | null;
  prestigeTriggered: boolean;
  softResetTriggered: boolean;
  /** Mastery level after this serve (matched recipes only). */
  masteryLevel?: number;
  masteryLeveledUp?: boolean;
  /** Stars bonus applied to this serve's score (pre-serve level). */
  masteryBonusApplied?: number;
}

export interface DishScore {
  matchStars: number;
  tip: number;
  ratingDelta: number;
  nextRating: number;
  recipeId: string | null;
  recipeName: string | null;
  prestigeTriggered: boolean;
  softResetTriggered: boolean;
}

function validateIngredientIds(
  ingredientIds: string[],
  unlockedIds: string[],
): string | null {
  if (ingredientIds.length < 3 || ingredientIds.length > 6) {
    return 'Dish must use 3–6 ingredients';
  }
  const unlocked = new Set(unlockedIds);
  for (const id of ingredientIds) {
    if (!unlocked.has(id)) return `Ingredient not unlocked: ${id}`;
  }
  return null;
}

function clampMatchStars(stars: number): number {
  return Math.min(10, Math.max(0, stars));
}

export function scoreDishForCustomer(
  state: GameState,
  customer: Customer,
  ingredientIds: string[],
  ctx: DomainContext,
  options?: { masteryBonus?: number },
): DishScore {
  if (!state.activeDay) {
    throw new Error('No active service day');
  }

  const validationError = validateIngredientIds(ingredientIds, state.unlockedIngredientIds);
  if (validationError) {
    throw new Error(validationError);
  }

  const ingredients = ingredientIds.map((id) => {
    const item = ctx.ingredientsById.get(id);
    if (!item) throw new Error(`Unknown ingredient: ${id}`);
    return item;
  });

  const dish = aggregateDish(ingredients.map((item) => item.flavor));
  const recipe = findMatchingRecipe(ingredientIds, ctx.recipes);
  const recipeBonus = recipe ? RECIPE_MATCH_BONUS : 0;
  const baseMatchStars = computeMatchStars(
    dish,
    customer.preference,
    ingredientIds,
    ctx.compoundAffinity,
    recipeBonus,
  );
  const masteryBonus = options?.masteryBonus ?? 0;
  const matchStars = clampMatchStars(baseMatchStars + masteryBonus);

  const modifier = ctx.modifiersById.get(state.activeDay.modifierId);
  const modifierOutcome = applyModifierEffects(
    modifier,
    dish,
    matchStars,
    ingredients.map((item) => item.category),
  );

  const tip = computeTip({
    day: state.day,
    rating: state.rating,
    prestige: state.prestige,
    matchStars,
    tipMultiplier: modifierOutcome.tipMultiplier,
  });

  const prestigeRatingScale = prestigeRatingDeltaMultiplier(state.prestige);
  const ratingResult = applyReview(
    state.rating,
    matchStars,
    modifierOutcome.ratingDeltaMultiplier * prestigeRatingScale,
  );
  let nextRating = ratingResult.rating + modifierOutcome.extraRatingDelta * prestigeRatingScale;
  nextRating = Math.min(6, Math.max(0, nextRating));

  let prestigeTriggered = ratingResult.prestigeTriggered || nextRating >= 6;
  let softResetTriggered = ratingResult.softResetTriggered || nextRating <= 0;

  if (prestigeTriggered) {
    prestigeTriggered = true;
    softResetTriggered = false;
  } else if (softResetTriggered) {
    softResetTriggered = true;
  }

  return {
    matchStars,
    tip,
    ratingDelta: nextRating - state.rating,
    nextRating,
    recipeId: recipe?.id ?? null,
    recipeName: recipe?.name ?? null,
    prestigeTriggered,
    softResetTriggered,
  };
}

export function scoreAndPayForCustomer(
  state: GameState,
  customer: Customer,
  ingredientIds: string[],
  ctx: DomainContext,
  options?: { masteryBonus?: number },
): ServeResult {
  const score = scoreDishForCustomer(state, customer, ingredientIds, ctx, options);

  let nextState = cloneGameState(state);
  nextState.cash += score.tip;
  nextState.rating = score.nextRating;
  nextState.stats.totalCustomersServed += 1;
  nextState.stats.totalEarnings += score.tip;
  nextState.composeDraftIngredientIds = undefined;

  const activeDay: ActiveDay = {
    ...nextState.activeDay!,
    dayEarnings: nextState.activeDay!.dayEarnings + score.tip,
    dayMatchSum: nextState.activeDay!.dayMatchSum + score.matchStars,
    dayRatingDelta:
      (nextState.activeDay!.dayRatingDelta ?? 0) + score.ratingDelta,
    customersServed: nextState.activeDay!.customersServed + 1,
  };
  nextState.activeDay = activeDay;

  if (score.recipeId && !nextState.discoveredRecipeIds.includes(score.recipeId)) {
    nextState.discoveredRecipeIds = [...nextState.discoveredRecipeIds, score.recipeId];
  }

  let prestigeTriggered = score.prestigeTriggered;
  let softResetTriggered = score.softResetTriggered;

  if (prestigeTriggered) {
    nextState = applyPrestige({
      ...nextState,
      rating: score.nextRating >= 6 ? score.nextRating : 6,
    });
    prestigeTriggered = true;
    softResetTriggered = false;
  } else if (softResetTriggered) {
    nextState = applySoftReset({ ...nextState, rating: 0 });
    softResetTriggered = true;
  }
  if (nextState.activeDay && (prestigeTriggered || softResetTriggered)) {
    nextState.activeDay = {
      ...nextState.activeDay,
      ratingResetOccurred: true,
    };
  }

  return {
    state: nextState,
    matchStars: score.matchStars,
    tip: score.tip,
    ratingDelta: score.ratingDelta,
    recipeId: score.recipeId,
    recipeName: score.recipeName,
    prestigeTriggered,
    softResetTriggered,
  };
}

export function serveCustomer(
  state: GameState,
  ingredientIds: string[],
  ctx: DomainContext,
): ServeResult {
  if (!state.activeDay) {
    throw new Error('No active service day');
  }

  const customer = state.activeDay.customers[state.activeDay.queueIndex];
  if (!customer) {
    throw new Error('No current customer in queue');
  }

  return scoreAndPayForCustomer(state, customer, ingredientIds, ctx);
}

export function advanceCustomer(state: GameState): GameState {
  if (!state.activeDay) {
    throw new Error('No active service day');
  }
  const next = cloneGameState(state);
  next.activeDay = {
    ...next.activeDay!,
    queueIndex: next.activeDay!.queueIndex + 1,
  };
  next.composeDraftIngredientIds = undefined;
  return next;
}

export function isDayComplete(state: GameState): boolean {
  if (!state.activeDay) return false;
  const { floor, customers, customersServed } = state.activeDay;
  const queueDone = customersServed >= customers.length;

  if (!floor) return queueDone;

  const floorIdle =
    floor.pool.every(
      (g) => g.stage === 'waiting' || g.stage === 'queued' || g.stage === 'entering',
    ) &&
    floor.tables.every((t) => t.state === 'unset') &&
    floor.tickets.length === 0;

  if (floorIdle) return queueDone;
  return isFloorDayComplete(floor);
}

export function closeDay(state: GameState): GameState {
  if (!state.activeDay) {
    throw new Error('No active service day');
  }
  if (!isDayComplete(state)) {
    throw new Error('Day is not complete');
  }

  const next = cloneGameState(state);
  const activeDay = next.activeDay!;
  const averageMatch =
    activeDay.customersServed > 0
      ? activeDay.dayMatchSum / activeDay.customersServed
      : 0;

  const matchBonus = dayBonusEarnings(activeDay.dayEarnings, averageMatch);
  const volumeBonus = volumeBonusEarnings(
    activeDay.dayEarnings,
    activeDay.customersServed,
    next.seatingCapacity,
  );
  const bonus = matchBonus + volumeBonus;
  if (bonus > 0) {
    next.cash += bonus;
    next.stats.totalEarnings += bonus;
  }

  next.activeDay = null;
  next.composeDraftIngredientIds = undefined;
  next.day += 1;

  return next;
}
