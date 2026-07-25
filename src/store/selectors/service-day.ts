import type { Customer } from '../../domain/day/types.ts';
import { isDayComplete } from '../../domain/day/serve.ts';
import {
  playerNearStation,
  seatedUnorderedCustomerIds,
} from '../../domain/floor/interact.ts';
import type { FloorTicket } from '../../domain/floor/types.ts';
import type { GameState } from '../../domain/state/game-state.ts';
import { getDomainContext } from '../../app/content-loader.ts';
import type { GameStore } from '../game-store.ts';

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

export function selectFloorActive(state: GameState): boolean {
  return Boolean(state.activeDay?.floor);
}

export function selectFloorPlayerGrid(state: GameStore): { x: number; y: number } | null {
  if (state.floorPlayerGrid) return state.floorPlayerGrid;
  return state.activeDay?.floor?.playerPosition ?? null;
}

export function selectSeatedUnorderedCustomerIds(state: GameState): string[] {
  const floor = state.activeDay?.floor;
  if (!floor) return [];
  return seatedUnorderedCustomerIds(floor);
}

export function selectCanTakeFloorOrders(state: GameState): boolean {
  return selectSeatedUnorderedCustomerIds(state).length > 0;
}

export function selectFloorComposeTicket(state: GameState): FloorTicket | null {
  const floor = state.activeDay?.floor;
  if (!floor || floor.carriedTicketId) return null;
  const selectedId = floor.selectedTicketId;
  if (selectedId) {
    const selected = floor.tickets.find((t) => t.id === selectedId);
    if (selected?.status === 'open') return selected;
  }
  return floor.tickets.find((t) => t.status === 'open') ?? null;
}

export function selectShowFloorCompose(state: GameStore): boolean {
  if (!state.activeDay?.floor || state.pendingReview || !state.modifierDismissed) {
    return false;
  }
  const player = selectFloorPlayerGrid(state);
  if (!player || !playerNearStation(player, state.placements)) return false;
  return selectFloorComposeTicket(state) !== null;
}
