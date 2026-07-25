import { aggregateDish } from '../flavor/aggregate.ts';
import { findMatchingRecipe, RECIPE_MATCH_BONUS } from '../flavor/recipe-match.ts';
import { computeMatchStars } from '../flavor/scoring.ts';
import { computeTip } from '../economy/tips.ts';
import { prestigeRatingDeltaMultiplier } from '../balance/prestige-pacing.ts';
import { applyReview } from '../rating/update.ts';
import { applyPrestige } from '../rating/prestige.ts';
import { applySoftReset } from '../rating/soft-reset.ts';
import type { DomainContext } from '../context.ts';
import type { GameState } from '../state/game-state.ts';
import { cloneGameState } from '../state/game-state.ts';
import type { ActiveDay } from './types.ts';
import { applyModifierEffects } from './modifiers.ts';

export interface ServeResult {
  state: GameState;
  matchStars: number;
  tip: number;
  ratingDelta: number;
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

export function serveCustomer(
  state: GameState,
  ingredientIds: string[],
  ctx: DomainContext,
): ServeResult {
  if (!state.activeDay) {
    throw new Error('No active service day');
  }

  const validationError = validateIngredientIds(ingredientIds, state.unlockedIngredientIds);
  if (validationError) {
    throw new Error(validationError);
  }

  const customer = state.activeDay.customers[state.activeDay.queueIndex];
  if (!customer) {
    throw new Error('No current customer in queue');
  }

  const ingredients = ingredientIds.map((id) => {
    const item = ctx.ingredientsById.get(id);
    if (!item) throw new Error(`Unknown ingredient: ${id}`);
    return item;
  });

  const dish = aggregateDish(ingredients.map((item) => item.flavor));
  const recipe = findMatchingRecipe(ingredientIds, ctx.recipes);
  const recipeBonus = recipe ? RECIPE_MATCH_BONUS : 0;
  const matchStars = computeMatchStars(
    dish,
    customer.preference,
    ingredientIds,
    ctx.compoundAffinity,
    recipeBonus,
  );

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

  let nextState = cloneGameState(state);
  nextState.cash += tip;
  nextState.rating = nextRating;
  nextState.stats.totalCustomersServed += 1;
  nextState.stats.totalEarnings += tip;
  nextState.composeDraftIngredientIds = undefined;

  const activeDay: ActiveDay = {
    ...nextState.activeDay!,
    dayEarnings: nextState.activeDay!.dayEarnings + tip,
    dayMatchSum: nextState.activeDay!.dayMatchSum + matchStars,
    customersServed: nextState.activeDay!.customersServed + 1,
  };
  nextState.activeDay = activeDay;

  if (recipe && !nextState.discoveredRecipeIds.includes(recipe.id)) {
    nextState.discoveredRecipeIds = [...nextState.discoveredRecipeIds, recipe.id];
  }

  let prestigeTriggered = ratingResult.prestigeTriggered || nextRating >= 6;
  let softResetTriggered = ratingResult.softResetTriggered || nextRating <= 0;

  if (prestigeTriggered) {
    nextState = applyPrestige({ ...nextState, rating: nextRating >= 6 ? nextRating : 6 });
    prestigeTriggered = true;
    softResetTriggered = false;
  } else if (softResetTriggered) {
    nextState = applySoftReset({ ...nextState, rating: 0 });
    softResetTriggered = true;
  }

  return {
    state: nextState,
    matchStars,
    tip,
    ratingDelta: nextRating - state.rating,
    recipeId: recipe?.id ?? null,
    recipeName: recipe?.name ?? null,
    prestigeTriggered,
    softResetTriggered,
  };
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
  return state.activeDay.customersServed >= state.activeDay.customers.length;
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

  if (averageMatch >= 7.0) {
    const bonus = Math.floor(activeDay.dayEarnings * 0.05);
    next.cash += bonus;
    next.stats.totalEarnings += bonus;
  }

  next.activeDay = null;
  next.composeDraftIngredientIds = undefined;
  next.day += 1;

  return next;
}
