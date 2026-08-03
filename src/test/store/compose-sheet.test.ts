import { beforeEach, describe, expect, it } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import { getGameStateSnapshot, useGameStore } from '../../store/game-store.ts';
import { waitingGuestServicePositions } from '../../domain/floor/interact.ts';
import {
  selectCanOpenFloorCompose,
  selectComposeDraftIds,
  selectShowFloorCompose,
} from '../../store/selectors/service-day.ts';
import '../test-helpers.ts';

function movePlayerToWaitingGuest(): void {
  const state = useGameStore.getState();
  useGameStore
    .getState()
    .setFloorNavPosition(
      waitingGuestServicePositions(state.gridSize.w, state.gridSize.h)[0]!,
    );
}

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
  movePlayerToWaitingGuest();
  await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
  const seating = useGameStore.getState().activeDay!.floor!.pool.find((guest) => guest.stage === 'seating')!;
  await useGameStore.getState().dispatch({
    type: 'FLOOR_COMPLETE_SEATING',
    guestId: seating.id,
  });
  const seated = useGameStore.getState().activeDay!.floor!.pool.find((guest) => guest.stage === 'seated')!;
  useGameStore.getState().setFloorNavPosition({
    x: seated.seat!.x,
    y: seated.seat!.y + 2,
  });
  await useGameStore.getState().dispatch({
    type: 'FLOOR_TAKE_ORDERS',
    customerIds: [seated.customer.id],
  });

  const station = useGameStore.getState().placements.find((placement) => placement.itemKey === 'prep_station')!;
  useGameStore.getState().setFloorNavPosition({ x: station.x - 1, y: station.y });
}

describe('compose sheet UI lifecycle', () => {
  beforeEach(() => {
    resetStore();
  });

  it('rejects remote orders at the store boundary', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    useGameStore.getState().dismissModifier();
    for (const table of useGameStore.getState().activeDay!.floor!.tables) {
      await useGameStore.getState().dispatch({
        type: 'FLOOR_SET_TABLE',
        placementId: table.placementId,
      });
    }
    await useGameStore.getState().dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
    movePlayerToWaitingGuest();
    await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
    const seating = useGameStore.getState().activeDay!.floor!.pool.find((guest) => guest.stage === 'seating')!;
    await useGameStore.getState().dispatch({
      type: 'FLOOR_COMPLETE_SEATING',
      guestId: seating.id,
    });
    const seated = useGameStore.getState().activeDay!.floor!.pool.find((guest) => guest.stage === 'seated')!;

    useGameStore.getState().setFloorNavPosition({ x: 99, y: 99 });
    await useGameStore.getState().dispatch({
      type: 'FLOOR_TAKE_ORDERS',
      customerIds: [seated.customer.id],
    });
    expect(useGameStore.getState().activeDay!.floor!.tickets).toHaveLength(0);

    useGameStore.getState().setFloorNavPosition({
      x: seated.seat!.x,
      y: seated.seat!.y + 2,
    });
    expect(useGameStore.getState().activeDay!.floor!.playerPosition).toEqual({
      x: seated.seat!.x,
      y: seated.seat!.y + 2,
    });
    await useGameStore.getState().dispatch({
      type: 'FLOOR_TAKE_ORDERS',
      customerIds: [seated.customer.id],
    });
    expect(useGameStore.getState().activeDay!.floor!.tickets).toHaveLength(1);
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
    const ticket = useGameStore.getState().activeDay!.floor!.tickets[0]!;
    const ingredientIds = useGameStore.getState().unlockedIngredientIds.slice(0, 3);
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TICKET_DRAFT',
      ticketId: ticket.id,
      ingredientIds,
    });
    useGameStore.getState().openComposeSheet();
    useGameStore.getState().closeComposeSheet();

    expect(useGameStore.getState().composeSheetOpen).toBe(false);
    expect(selectComposeDraftIds(useGameStore.getState())).toEqual(ingredientIds);
  });

  it('actively clears on lost adjacency and does not stale-reopen', async () => {
    await advanceToCookableTicket();
    const station = useGameStore.getState().placements.find((placement) => placement.itemKey === 'prep_station')!;
    useGameStore.getState().openComposeSheet();
    useGameStore.getState().setFloorNavPosition({ x: 0, y: 0 });
    expect(useGameStore.getState().composeSheetOpen).toBe(false);

    useGameStore.getState().setFloorNavPosition({ x: station.x - 1, y: station.y });
    expect(selectCanOpenFloorCompose(useGameStore.getState())).toBe(true);
    expect(selectShowFloorCompose(useGameStore.getState())).toBe(false);
  });

  it('clears when plating invalidates the cook interaction', async () => {
    await advanceToCookableTicket();
    useGameStore.getState().openComposeSheet();
    const ticket = useGameStore.getState().activeDay!.floor!.tickets[0]!;
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TICKET_DRAFT',
      ticketId: ticket.id,
      ingredientIds: useGameStore.getState().unlockedIngredientIds.slice(0, 3),
    });
    await useGameStore.getState().dispatch({
      type: 'FLOOR_PLATE',
      ticketId: ticket.id,
    });
    expect(useGameStore.getState().composeSheetOpen).toBe(false);
  });

  it('keeps ticket A and B drafts independent while switching selection', async () => {
    await advanceToCookableTicket();
    const current = useGameStore.getState();
    const floor = current.activeDay!.floor!;
    const ticketA = floor.tickets[0]!;
    const customerB = floor.pool.find(
      (guest) => guest.customer.id !== ticketA.customerId,
    )!.customer;
    const ticketB = {
      id: `ticket_${customerB.id}`,
      customerId: customerB.id,
      ingredientIds: [] as string[],
      status: 'open' as const,
    };
    useGameStore.setState({
      activeDay: {
        ...current.activeDay!,
        floor: { ...floor, tickets: [...floor.tickets, ticketB] },
      },
    });
    const draftA = current.unlockedIngredientIds.slice(0, 3);
    const draftB = current.unlockedIngredientIds.slice(3, 6);

    useGameStore.getState().setFloorSelectedTicket(ticketA.id);
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TICKET_DRAFT',
      ticketId: ticketA.id,
      ingredientIds: draftA,
    });
    useGameStore.getState().setFloorSelectedTicket(ticketB.id);
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TICKET_DRAFT',
      ticketId: ticketB.id,
      ingredientIds: draftB,
    });
    expect(selectComposeDraftIds(useGameStore.getState())).toEqual(draftB);

    useGameStore.getState().setFloorSelectedTicket(ticketA.id);
    expect(selectComposeDraftIds(useGameStore.getState())).toEqual(draftA);
    useGameStore.getState().setFloorSelectedTicket(ticketB.id);
    expect(selectComposeDraftIds(useGameStore.getState())).toEqual(draftB);
  });

  it('rejects plating remotely without mutating the selected ticket', async () => {
    await advanceToCookableTicket();
    const ticket = useGameStore.getState().activeDay!.floor!.tickets[0]!;
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TICKET_DRAFT',
      ticketId: ticket.id,
      ingredientIds: useGameStore.getState().unlockedIngredientIds.slice(0, 3),
    });
    useGameStore.getState().setFloorNavPosition({ x: 0, y: 0 });
    const before = getGameStateSnapshot();

    await expect(
      useGameStore.getState().dispatch({ type: 'FLOOR_PLATE', ticketId: ticket.id }),
    ).rejects.toThrow(/owned station/);
    expect(getGameStateSnapshot()).toEqual(before);
  });

  it('rejects plating in the wrong room without mutating the draft', async () => {
    await advanceToCookableTicket();
    const ticket = useGameStore.getState().activeDay!.floor!.tickets[0]!;
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TICKET_DRAFT',
      ticketId: ticket.id,
      ingredientIds: useGameStore.getState().unlockedIngredientIds.slice(0, 3),
    });
    useGameStore.setState({
      kitchenAnnexOwned: true,
      activeFloorRoom: 'back_kitchen',
      floorPlayerGrid: { x: 1, y: 1 },
    });
    const before = getGameStateSnapshot();

    await expect(
      useGameStore.getState().dispatch({ type: 'FLOOR_PLATE', ticketId: ticket.id }),
    ).rejects.toThrow(/owned station/);
    expect(getGameStateSnapshot()).toEqual(before);
  });

  it('rejects plating at a canonical station the player does not own', async () => {
    await advanceToCookableTicket();
    const ticket = useGameStore.getState().activeDay!.floor!.tickets[0]!;
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TICKET_DRAFT',
      ticketId: ticket.id,
      ingredientIds: useGameStore.getState().unlockedIngredientIds.slice(0, 3),
    });
    const current = useGameStore.getState();
    useGameStore.setState({
      placements: current.placements.map((placement) =>
        placement.itemKey === 'prep_station'
          ? { ...placement, itemKey: 'grill' }
          : placement,
      ),
    });
    const before = getGameStateSnapshot();

    await expect(
      useGameStore.getState().dispatch({ type: 'FLOOR_PLATE', ticketId: ticket.id }),
    ).rejects.toThrow(/owned station/);
    expect(getGameStateSnapshot()).toEqual(before);
  });

  it('rejects a non-canonical ticket without mutating either ticket', async () => {
    await advanceToCookableTicket();
    const current = useGameStore.getState();
    const floor = current.activeDay!.floor!;
    const ticketA = floor.tickets[0]!;
    const customerB = floor.pool.find(
      (guest) => guest.customer.id !== ticketA.customerId,
    )!.customer;
    const ticketB = {
      id: `ticket_${customerB.id}`,
      customerId: customerB.id,
      ingredientIds: current.unlockedIngredientIds.slice(3, 6),
      status: 'open' as const,
    };
    useGameStore.setState({
      activeDay: {
        ...current.activeDay!,
        floor: {
          ...floor,
          tickets: [
            { ...ticketA, ingredientIds: current.unlockedIngredientIds.slice(0, 3) },
            ticketB,
          ],
          selectedTicketId: ticketB.id,
        },
      },
    });
    const before = getGameStateSnapshot();

    await expect(
      useGameStore.getState().dispatch({ type: 'FLOOR_PLATE', ticketId: ticketA.id }),
    ).rejects.toThrow(/owned station/);
    expect(getGameStateSnapshot()).toEqual(before);
  });

  it('never includes UI state or methods in the persisted snapshot', async () => {
    await advanceToCookableTicket();
    useGameStore.getState().openComposeSheet();
    const snapshot = getGameStateSnapshot() as unknown as Record<string, unknown>;
    expect(snapshot).not.toHaveProperty('composeSheetOpen');
    expect(snapshot).not.toHaveProperty('openComposeSheet');
    expect(snapshot).not.toHaveProperty('closeComposeSheet');
  });
});
