import ingredients from '../../data/ingredients.json';
import equipment from '../../data/equipment.json';
import recipes from '../../data/recipes.json';
import archetypes from '../../data/archetypes.json';
import compoundAffinity from '../../data/compound-affinity.json';
import modifiers from '../../data/modifiers.json';
import { createDomainContext, type DomainContext } from '../../domain/context.ts';
import { canPurchase } from '../../domain/economy/purchases.ts';
import { findBestMatchCombo } from '../../domain/day/customer-request-generator.ts';
import { isDayComplete } from '../../domain/day/serve.ts';
import { gameReducer } from '../../domain/reducer.ts';
import { gameDaysToRealHours } from '../../domain/balance/prestige-pacing.ts';
import { createNewGameState, type GameState } from '../../domain/state/game-state.ts';
import type { DailyModifier } from '../../domain/day/modifiers.ts';
import type { ContentBundle, Ingredient } from '../../domain/types.ts';

const bundle: ContentBundle = {
  ingredients: ingredients as Ingredient[],
  equipment,
  recipes,
  archetypes,
  compoundAffinity,
};

export const simContext = createDomainContext({
  ingredients: bundle.ingredients,
  recipes: bundle.recipes,
  archetypes: bundle.archetypes,
  modifiers: modifiers as DailyModifier[],
  compoundAffinity: bundle.compoundAffinity,
  equipment: bundle.equipment,
});

function serveCurrentCustomer(state: GameState, context: DomainContext): GameState {
  if (!state.activeDay) throw new Error('No active day');
  const customer = state.activeDay.customers[state.activeDay.queueIndex];
  if (!customer) throw new Error('Missing customer');
  const best = findBestMatchCombo(
    state.unlockedIngredientIds,
    customer.preference,
    context.ingredientsById,
    context.compoundAffinity,
  );
  let next = gameReducer(state, { type: 'SERVE_DISH', ingredientIds: best.ingredientIds }, context).state;
  if (next.activeDay && next.activeDay.customersServed < next.activeDay.customers.length) {
    next = gameReducer(next, { type: 'NEXT_CUSTOMER' }, context).state;
  }
  return next;
}

export function playOneDay(state: GameState, context: DomainContext = simContext): GameState {
  let next = gameReducer(state, { type: 'OPEN_DAY' }, context).state;
  while (next.activeDay && !isDayComplete(next)) {
    next = serveCurrentCustomer(next, context);
  }
  if (next.activeDay && isDayComplete(next)) {
    return gameReducer(next, { type: 'CLOSE_DAY' }, context).state;
  }
  return next;
}

export function buyAffordableProgress(state: GameState, context: DomainContext): GameState {
  let next = state;

  for (const gate of bundle.equipment) {
    if (gate.id === 'prep_station') continue;
    if (canPurchase(next, { type: 'equipment', equipmentId: gate.id }, context)) {
      next = gameReducer(next, { type: 'PURCHASE', purchase: { type: 'equipment', equipmentId: gate.id } }, context).state;
    }
  }

  for (const ingredient of bundle.ingredients) {
    if (canPurchase(next, { type: 'ingredient', ingredientId: ingredient.id }, context)) {
      next = gameReducer(next, { type: 'PURCHASE', purchase: { type: 'ingredient', ingredientId: ingredient.id } }, context).state;
    }
  }

  return next;
}

export function simulateCompetentRun(
  seed: number,
  maxDays: number,
  context: DomainContext = simContext,
  startState?: GameState,
  options?: { shop?: boolean },
): { daysPlayed: number; prestigeReached: boolean; finalState: GameState } {
  let state = startState ?? createNewGameState(seed);
  const prestigeAtStart = state.prestige;
  const shop = options?.shop !== false;

  for (let i = 0; i < maxDays; i++) {
    state = playOneDay(state, context);
    if (shop) {
      state = buyAffordableProgress(state, context);
    }
    if (state.prestige > prestigeAtStart) {
      return { daysPlayed: i + 1, prestigeReached: true, finalState: state };
    }
  }

  return { daysPlayed: maxDays, prestigeReached: false, finalState: state };
}

export interface PrestigeCycleResult {
  cycle: number;
  prestigeFrom: number;
  daysInCycle: number;
  cumulativeDays: number;
  cumulativeHours: number;
  reached: boolean;
}

export function simulatePrestigeCurve(
  seed: number,
  maxCycles: number,
  maxDaysPerCycle: number,
  context: DomainContext = simContext,
): PrestigeCycleResult[] {
  let state = createNewGameState(seed);
  const results: PrestigeCycleResult[] = [];
  let cumulativeDays = 0;

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    const prestigeFrom = state.prestige;
    state.globalRunSeed = seed ^ (prestigeFrom * 2_654_435_761);
    const run = simulateCompetentRun(seed, maxDaysPerCycle, context, state);
    cumulativeDays += run.daysPlayed;
    results.push({
      cycle,
      prestigeFrom,
      daysInCycle: run.daysPlayed,
      cumulativeDays,
      cumulativeHours: gameDaysToRealHours(cumulativeDays),
      reached: run.prestigeReached,
    });
    if (!run.prestigeReached) break;
    state = run.finalState;
  }

  return results;
}

export function formatPrestigeCurveReport(
  label: string,
  curve: PrestigeCycleResult[],
  minutesPerDay: number,
): string {
  const lines = [
    `=== ${label} ===`,
    `minutes_per_day=${minutesPerDay}`,
    'cycle | P_start | days | cum_days | cum_hours',
  ];
  for (const row of curve) {
    lines.push(
      `${String(row.cycle).padStart(5)} | ${String(row.prestigeFrom).padStart(7)} | ${String(row.daysInCycle).padStart(4)} | ${String(row.cumulativeDays).padStart(8)} | ${row.cumulativeHours.toFixed(1)}`,
    );
  }
  const last = curve[curve.length - 1];
  if (last) {
    lines.push(`total_cycles=${curve.length} cumulative_hours=${last.cumulativeHours.toFixed(1)}`);
  }
  return lines.join('\n');
}
