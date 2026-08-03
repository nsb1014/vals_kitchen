import { beforeEach, describe, expect, it } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import { waitingGuestServicePositions } from '../../domain/floor/interact.ts';
import type { FloorTicket } from '../../domain/floor/types.ts';
import { useGameStore } from '../../store/game-store.ts';
import {
  selectCanRequestSeatFloorGuest,
  selectCanSeatFloorGuest,
  selectCanTakeFloorOrders,
} from '../../store/selectors/service-day.ts';
import '../test-helpers.ts';

function resetStore(): void {
  useGameStore.setState({
    ...createNewGameState(8721),
    screen: 'restaurant',
    editLayoutMode: false,
    activeFloorRoom: 'main',
    floorPlayerGrid: null,
    modifierDismissed: false,
    pendingReview: null,
    daySummary: null,
    ceremony: null,
    composeSheetOpen: false,
  });
}

function openTicket(number: number): FloorTicket {
  return {
    id: `ticket_fixture_${number}`,
    customerId: `fixture_${number}`,
    ingredientIds: [],
    status: 'open',
  };
}

async function prepareWaitingGuest(setTables = true): Promise<void> {
  await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
  await useGameStore.getState().dismissModifier();
  if (setTables) {
    for (const table of useGameStore.getState().activeDay!.floor!.tables) {
      await useGameStore.getState().dispatch({
        type: 'FLOOR_SET_TABLE',
        placementId: table.placementId,
      });
    }
  }
  await useGameStore.getState().dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
  expect(
    useGameStore
      .getState()
      .activeDay!.floor!.pool.some((guest) => guest.stage === 'waiting'),
  ).toBe(true);
}

async function prepareAdjacentSeatedGuest(): Promise<void> {
  await prepareWaitingGuest();
  const state = useGameStore.getState();
  useGameStore
    .getState()
    .setFloorNavPosition(
      waitingGuestServicePositions(state.gridSize.w, state.gridSize.h)[0]!,
    );
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
}

function setTickets(tickets: FloorTicket[]): void {
  const current = useGameStore.getState();
  const activeDay = current.activeDay!;
  useGameStore.setState({
    activeDay: {
      ...activeDay,
      floor: {
        ...activeDay.floor!,
        tickets,
        selectedTicketId: tickets.find((ticket) => ticket.status === 'open')?.id ?? null,
      },
    },
  });
}

describe('floor order capacity selector', () => {
  beforeEach(() => {
    resetStore();
  });

  it('disables at four active tickets and recovers after one is delivered', async () => {
    await prepareAdjacentSeatedGuest();
    const full = [1, 2, 3, 4].map(openTicket);

    setTickets(full);
    expect(selectCanTakeFloorOrders(useGameStore.getState())).toBe(false);

    setTickets([{ ...full[0]!, status: 'delivered' }, ...full.slice(1)]);
    expect(selectCanTakeFloorOrders(useGameStore.getState())).toBe(true);
  });

  it('separates a valid seating request from a physically valid seat action', async () => {
    await prepareWaitingGuest();

    expect(selectCanRequestSeatFloorGuest(useGameStore.getState())).toBe(true);
    expect(selectCanSeatFloorGuest(useGameStore.getState())).toBe(false);

    const before = useGameStore.getState().activeDay!.floor!;
    await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
    expect(useGameStore.getState().activeDay!.floor).toEqual(before);

    const state = useGameStore.getState();
    useGameStore
      .getState()
      .setFloorNavPosition(
        waitingGuestServicePositions(state.gridSize.w, state.gridSize.h)[0]!,
      );
    expect(selectCanRequestSeatFloorGuest(useGameStore.getState())).toBe(true);
    expect(selectCanSeatFloorGuest(useGameStore.getState())).toBe(true);
  });

  it('rejects seating in the back kitchen even at a matching grid coordinate', async () => {
    await prepareWaitingGuest();
    const state = useGameStore.getState();
    useGameStore.setState({ activeFloorRoom: 'back_kitchen' });
    useGameStore
      .getState()
      .setFloorNavPosition(
        waitingGuestServicePositions(state.gridSize.w, state.gridSize.h)[0]!,
      );

    expect(selectCanRequestSeatFloorGuest(useGameStore.getState())).toBe(false);
    expect(selectCanSeatFloorGuest(useGameStore.getState())).toBe(false);
    await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
    expect(
      useGameStore
        .getState()
        .activeDay!.floor!.pool.some((guest) => guest.stage === 'seating'),
    ).toBe(false);
  });

  it('keeps unavailable seating inert even when Val is at the door line', async () => {
    await prepareWaitingGuest(false);
    const state = useGameStore.getState();
    useGameStore
      .getState()
      .setFloorNavPosition(
        waitingGuestServicePositions(state.gridSize.w, state.gridSize.h)[0]!,
      );

    expect(selectCanRequestSeatFloorGuest(useGameStore.getState())).toBe(false);
    expect(selectCanSeatFloorGuest(useGameStore.getState())).toBe(false);
    await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
    expect(
      useGameStore
        .getState()
        .activeDay!.floor!.pool.some((guest) => guest.stage === 'seating'),
    ).toBe(false);
  });

  it('seats exactly once from a canonical waiting-guest service position', async () => {
    await prepareWaitingGuest();
    const state = useGameStore.getState();
    useGameStore
      .getState()
      .setFloorNavPosition(
        waitingGuestServicePositions(state.gridSize.w, state.gridSize.h)[0]!,
      );

    await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
    const afterFirst = useGameStore.getState().activeDay!.floor!;
    const seating = afterFirst.pool.filter((guest) => guest.stage === 'seating');
    expect(seating).toHaveLength(1);
    expect(seating[0]!.seat).toBeDefined();

    await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
    expect(useGameStore.getState().activeDay!.floor).toEqual(afterFirst);
  });

});
