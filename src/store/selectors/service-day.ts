import type { Customer } from '../../domain/day/types.ts';
import { isDayComplete } from '../../domain/day/serve.ts';
import type { GameState } from '../../domain/state/game-state.ts';
import { getDomainContext } from '../../app/content-loader.ts';

export function selectCurrentCustomer(state: GameState): Customer | null {
  if (!state.activeDay) return null;
  return state.activeDay.customers[state.activeDay.queueIndex] ?? null;
}

export function selectComposeDraftIds(state: GameState): string[] {
  return state.composeDraftIngredientIds ?? [];
}

export function selectIsAwaitingServe(state: GameState): boolean {
  if (!state.activeDay) return false;
  return state.activeDay.customersServed === state.activeDay.queueIndex;
}

export function selectCanAdvanceCustomer(state: GameState): boolean {
  if (!state.activeDay) return false;
  return state.activeDay.customersServed > state.activeDay.queueIndex;
}

export function selectCanCloseDay(state: GameState): boolean {
  return isDayComplete(state);
}

export function selectActiveModifier(state: GameState) {
  if (!state.activeDay) return null;
  return getDomainContext().modifiersById.get(state.activeDay.modifierId) ?? null;
}

export function selectQueueProgress(state: GameState): { current: number; total: number } | null {
  if (!state.activeDay) return null;
  const total = state.activeDay.customers.length;
  const current = Math.min(state.activeDay.queueIndex + 1, total);
  return { current, total };
}

export function selectDayOpen(state: GameState): boolean {
  return state.activeDay !== null;
}
