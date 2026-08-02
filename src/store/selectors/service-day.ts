import type { Customer } from '../../domain/day/types.ts';
import { isDayComplete } from '../../domain/day/serve.ts';
import {
  adjacentDirtyTablePlacementIds,
  adjacentSeatedCustomerIds,
  adjacentUnsetTablePlacementIds,
  isCookStationItemKey,
  playerNearPlacement,
  seatedUnorderedCustomerIds,
} from '../../domain/floor/interact.ts';
import { hasAvailableSeatForWaitingGuest } from '../../domain/floor/sim.ts';
import {
  canEnqueue,
  resolveFloorComposeTicket,
} from '../../domain/floor/tickets.ts';
import type { FloorTicket } from '../../domain/floor/types.ts';
import type { GameState } from '../../domain/state/game-state.ts';
import { getDomainContext } from '../../app/content-loader.ts';
import type { GameStore } from '../game-store.ts';

export function selectCurrentCustomer(state: GameState): Customer | null {
  if (!state.activeDay) return null;
  return state.activeDay.customers[state.activeDay.queueIndex] ?? null;
}

export function selectComposeDraftIds(state: GameState): string[] {
  const floor = state.activeDay?.floor;
  if (floor) return resolveFloorComposeTicket(floor)?.ingredientIds ?? [];
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
  return (
    getDomainContext().modifiersById.get(state.activeDay.modifierId) ?? null
  );
}

export function selectQueueProgress(
  state: GameState,
): { current: number; total: number } | null {
  if (!state.activeDay) return null;
  const total = state.activeDay.customers.length;
  const current = Math.min(state.activeDay.queueIndex + 1, total);
  return { current, total };
}

export function selectDayOpen(state: GameState): boolean {
  return state.activeDay !== null;
}

/** Service overlays (open day, reviews, compose, summary) belong on Floor only. */
export function selectShowServiceDayOverlay(
  state: Pick<GameStore, 'screen'>,
): boolean {
  return state.screen === 'restaurant';
}

/** Between-day "Open for service?" card — restaurant floor only. */
export function selectShowOpenForService(state: GameStore): boolean {
  return (
    selectShowServiceDayOverlay(state) &&
    !state.activeDay &&
    !state.daySummary &&
    !state.editLayoutMode
  );
}

export function selectFloorActive(state: GameState): boolean {
  return Boolean(state.activeDay?.floor);
}

/** World-space tap cues disappear whenever a sheet owns floor interaction. */
export function selectShowFloorInteractionCues(
  state: Pick<
    GameStore,
    | 'screen'
    | 'activeDay'
    | 'modifierDismissed'
    | 'pendingReview'
    | 'daySummary'
    | 'ceremony'
    | 'composeSheetOpen'
    | 'editLayoutMode'
  >,
): boolean {
  return Boolean(
    state.screen === 'restaurant' &&
    state.activeDay?.floor &&
    state.modifierDismissed &&
    !state.pendingReview &&
    !state.daySummary &&
    !state.ceremony &&
    !state.composeSheetOpen &&
    !state.editLayoutMode,
  );
}

export function selectFloorPlayerGrid(
  state: GameStore,
): { x: number; y: number } | null {
  if (state.floorPlayerGrid) return state.floorPlayerGrid;
  return state.activeDay?.floor?.playerPosition ?? null;
}

export function selectSeatedUnorderedCustomerIds(state: GameState): string[] {
  const floor = state.activeDay?.floor;
  if (!floor) return [];
  return seatedUnorderedCustomerIds(floor);
}

export function selectAdjacentSeatedCustomerIds(state: GameStore): string[] {
  const floor = state.activeDay?.floor;
  const player = selectFloorPlayerGrid(state);
  if (!floor || !player || state.activeFloorRoom !== 'main') return [];
  return adjacentSeatedCustomerIds(floor, player);
}

export function selectCanTakeFloorOrders(state: GameStore): boolean {
  const floor = state.activeDay?.floor;
  return Boolean(
    floor &&
    selectAdjacentSeatedCustomerIds(state).length > 0 &&
    canEnqueue(floor.tickets, 1),
  );
}

export function selectCanSeatFloorGuest(state: GameStore): boolean {
  const floor = state.activeDay?.floor;
  return floor ? hasAvailableSeatForWaitingGuest(floor) : false;
}

export function selectAdjacentUnsetTablePlacementIds(
  state: GameStore,
): string[] {
  const floor = state.activeDay?.floor;
  const player = selectFloorPlayerGrid(state);
  if (!floor || !player || state.activeFloorRoom !== 'main') return [];
  return adjacentUnsetTablePlacementIds(floor, player, state.placements);
}

export function selectAdjacentDirtyTablePlacementIds(
  state: GameStore,
): string[] {
  const floor = state.activeDay?.floor;
  const player = selectFloorPlayerGrid(state);
  if (!floor || !player || state.activeFloorRoom !== 'main') return [];
  return adjacentDirtyTablePlacementIds(floor, player, state.placements);
}

export function selectCanSetFloorTable(state: GameStore): boolean {
  return selectAdjacentUnsetTablePlacementIds(state).length > 0;
}

export function selectCanClearFloorTable(state: GameStore): boolean {
  return selectAdjacentDirtyTablePlacementIds(state).length > 0;
}

export function selectFloorComposeTicket(state: GameState): FloorTicket | null {
  const floor = state.activeDay?.floor;
  return floor ? resolveFloorComposeTicket(floor) : null;
}

export function selectCanOpenFloorCompose(state: GameStore): boolean {
  if (
    !state.activeDay?.floor ||
    state.pendingReview ||
    !state.modifierDismissed
  ) {
    return false;
  }
  if (state.daySummary || state.ceremony) return false;
  const player = selectFloorPlayerGrid(state);
  const roomPlacements =
    state.activeFloorRoom === 'back_kitchen'
      ? state.backKitchenPlacements
      : state.placements;
  if (!player) return false;
  const ownedEquipment = new Set(state.purchasedEquipmentIds);
  const nearOwnedStation = roomPlacements.some(
    (placement) =>
      isCookStationItemKey(placement.itemKey) &&
      ownedEquipment.has(placement.itemKey) &&
      playerNearPlacement(player, placement),
  );
  if (!nearOwnedStation) return false;
  return selectFloorComposeTicket(state) !== null;
}

export function selectShowFloorCompose(state: GameStore): boolean {
  return state.composeSheetOpen && selectCanOpenFloorCompose(state);
}
