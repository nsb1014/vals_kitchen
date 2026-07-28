import { beforeEach, describe, expect, it } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import { getGameStateSnapshot, useGameStore } from '../../store/game-store.ts';
import {
  selectCanOpenFloorCompose,
  selectShowFloorCompose,
} from '../../store/selectors/service-day.ts';
import '../test-helpers.ts';

function resetStore(): void {
  useGameStore.setState({
    ...createNewGameState(7711),
    screen: 'restaurant',
    editLayoutMode: false,
    activeFloorRoom: 'main',
    hydrated: true,
    persistGranted: false,
    modifierDismissed: false,
    pendingReview: null,
    daySummary: null,
    ceremony: null,
    ceremonyPrestige: null,
    dayStartRating: null,
    recentReviews: [],
    flavorInspectorIngredientId: null,
    pendingPlacementItemKey: null,
    audioEnabled: true,
    musicEnabled: false,
    floorPlayerGrid: null,
    floorToast: null,
    celebrationQueue: [],
    composeSheetOpen: false,
  });
}

async function advanceToCookableTicket(): Promise<void> {
  await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
  useGameStore.getState().dismissModifier();
  const floor = useGameStore.getState().activeDay!.floor!;

  for (const table of floor.tables) {
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TABLE',
      placementId: table.placementId,
    });
  }
  await useGameStore.getState().dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
  await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
  const seated = useGameStore
    .getState()
    .activeDay!.floor!.pool.find((guest) => guest.stage === 'seated')!;
  await useGameStore.getState().dispatch({
    type: 'FLOOR_TAKE_ORDERS',
    customerIds: [seated.customer.id],
  });

  const station = useGameStore
    .getState()
    .placements.find((placement) => placement.itemKey === 'prep_station')!;
  useGameStore
    .getState()
    .setFloorNavPosition({ x: station.x - 1, y: station.y });
}

describe('compose sheet UI lifecycle', () => {
  beforeEach(() => {
    resetStore();
  });

  it('requires an explicit eligible open action', async () => {
    await advanceToCookableTicket();
    expect(selectCanOpenFloorCompose(useGameStore.getState())).toBe(true);
    expect(selectShowFloorCompose(useGameStore.getState())).toBe(false);

    useGameStore.getState().openComposeSheet();
    expect(useGameStore.getState().composeSheetOpen).toBe(true);
    expect(selectShowFloorCompose(useGameStore.getState())).toBe(true);
  });

  it('does not open when the player is not adjacent', async () => {
    await advanceToCookableTicket();
    useGameStore.getState().setFloorNavPosition({ x: 0, y: 0 });
    useGameStore.getState().openComposeSheet();
    expect(useGameStore.getState().composeSheetOpen).toBe(false);
  });

  it('closes without clearing the dish draft', async () => {
    await advanceToCookableTicket();
    const ingredientIds = useGameStore
      .getState()
      .unlockedIngredientIds.slice(0, 3);
    await useGameStore.getState().dispatch({
      type: 'SET_COMPOSE_DRAFT',
      ingredientIds,
    });
    useGameStore.getState().openComposeSheet();
    useGameStore.getState().closeComposeSheet();

    expect(useGameStore.getState().composeSheetOpen).toBe(false);
    expect(useGameStore.getState().composeDraftIngredientIds).toEqual(
      ingredientIds,
    );
  });

  it('actively clears on lost adjacency and does not stale-reopen', async () => {
    await advanceToCookableTicket();
    const station = useGameStore
      .getState()
      .placements.find((placement) => placement.itemKey === 'prep_station')!;
    useGameStore.getState().openComposeSheet();
    useGameStore.getState().setFloorNavPosition({ x: 0, y: 0 });
    expect(useGameStore.getState().composeSheetOpen).toBe(false);

    useGameStore
      .getState()
      .setFloorNavPosition({ x: station.x - 1, y: station.y });
    expect(selectCanOpenFloorCompose(useGameStore.getState())).toBe(true);
    expect(selectShowFloorCompose(useGameStore.getState())).toBe(false);
  });

  it('clears when plating invalidates the cook interaction', async () => {
    await advanceToCookableTicket();
    useGameStore.getState().openComposeSheet();
    const ticket = useGameStore.getState().activeDay!.floor!.tickets[0]!;
    await useGameStore.getState().dispatch({
      type: 'FLOOR_PLATE',
      ticketId: ticket.id,
      ingredientIds: useGameStore.getState().unlockedIngredientIds.slice(0, 3),
    });
    expect(useGameStore.getState().composeSheetOpen).toBe(false);
  });

  it('never includes UI state or methods in the persisted snapshot', async () => {
    await advanceToCookableTicket();
    useGameStore.getState().openComposeSheet();
    const snapshot = getGameStateSnapshot() as unknown as Record<
      string,
      unknown
    >;
    expect(snapshot).not.toHaveProperty('composeSheetOpen');
    expect(snapshot).not.toHaveProperty('openComposeSheet');
    expect(snapshot).not.toHaveProperty('closeComposeSheet');
  });
});
