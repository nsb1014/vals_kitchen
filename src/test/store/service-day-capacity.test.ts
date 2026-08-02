import { beforeEach, describe, expect, it } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import type { FloorTicket } from '../../domain/floor/types.ts';
import { useGameStore } from '../../store/game-store.ts';
import { selectCanTakeFloorOrders } from '../../store/selectors/service-day.ts';
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

async function prepareAdjacentSeatedGuest(): Promise<void> {
  await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
  useGameStore.getState().dismissModifier();
  for (const table of useGameStore.getState().activeDay!.floor!.tables) {
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TABLE',
      placementId: table.placementId,
    });
  }
  await useGameStore.getState().dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
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
});
