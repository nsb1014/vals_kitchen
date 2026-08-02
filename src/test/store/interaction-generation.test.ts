import { beforeEach, describe, expect, it, vi } from 'vitest';

const contentControl = vi.hoisted(() => ({
  deliveryLoad: null as Promise<void> | null,
}));

vi.mock('../../app/content-loader.ts', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../app/content-loader.ts')
  >();
  return {
    ...actual,
    ensureContentForAction(actionType: string) {
      if (actionType === 'FLOOR_DELIVER' && contentControl.deliveryLoad) {
        return contentControl.deliveryLoad;
      }
      return actual.ensureContentForAction(actionType);
    },
  };
});

import { createNewGameState } from '../../domain/state/game-state.ts';
import { exportSaveCode } from '../../persistence/saveCode.ts';
import {
  getGameplayInteractionGeneration,
  getGameStateSnapshot,
  setGameSaveRepositoryForTests,
  useGameStore,
} from '../../store/game-store.ts';
import '../test-helpers.ts';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function resetStore(seed = 8417): void {
  useGameStore.setState({
    ...createNewGameState(seed),
    screen: 'restaurant',
    editLayoutMode: false,
    activeFloorRoom: 'main',
    hydrated: true,
    persistGranted: false,
    modifierDismissed: false,
    serviceStartPending: false,
    serviceStartError: null,
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
    noticeActive: null,
    noticeSticky: null,
    tutorialDismissedStepId: null,
    notificationSurfaceActive: false,
    celebrationQueue: [],
    composeSheetOpen: false,
  });
}

async function advanceToCarriedTicket(): Promise<string> {
  await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
  await useGameStore.getState().dismissModifier();

  for (const table of useGameStore.getState().activeDay!.floor!.tables) {
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TABLE',
      placementId: table.placementId,
    });
  }
  await useGameStore.getState().dispatch({
    type: 'FLOOR_COMPLETE_ENTERING',
  });
  await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });

  const seating = useGameStore
    .getState()
    .activeDay!.floor!.pool.find((guest) => guest.stage === 'seating')!;
  await useGameStore.getState().dispatch({
    type: 'FLOOR_COMPLETE_SEATING',
    guestId: seating.id,
  });
  const seated = useGameStore
    .getState()
    .activeDay!.floor!.pool.find((guest) => guest.stage === 'seated')!;
  useGameStore.getState().setFloorNavPosition({
    x: seated.seat!.x,
    y: seated.seat!.y + 2,
  });
  await useGameStore.getState().dispatch({
    type: 'FLOOR_TAKE_ORDERS',
    customerIds: [seated.customer.id],
  });

  const ticketId = useGameStore.getState().activeDay!.floor!.tickets[0]!.id;
  const station = useGameStore
    .getState()
    .placements.find((placement) => placement.itemKey === 'prep_station')!;
  useGameStore
    .getState()
    .setFloorNavPosition({ x: station.x - 1, y: station.y });
  await useGameStore.getState().dispatch({
    type: 'FLOOR_SET_TICKET_DRAFT',
    ticketId,
    ingredientIds: useGameStore.getState().unlockedIngredientIds.slice(0, 3),
  });
  await useGameStore.getState().dispatch({ type: 'FLOOR_PLATE', ticketId });
  useGameStore.getState().setFloorNavPosition({
    x: seated.seat!.x,
    y: seated.seat!.y + 2,
  });
  return ticketId;
}

describe('gameplay interaction generation', () => {
  beforeEach(() => {
    contentControl.deliveryLoad = null;
    setGameSaveRepositoryForTests(null);
    resetStore();
  });

  it('changes only for actual screen navigation', () => {
    const before = getGameplayInteractionGeneration();

    useGameStore.getState().setAudioEnabled(false);
    useGameStore.getState().navigateTo('restaurant');
    expect(getGameplayInteractionGeneration()).toBe(before);

    useGameStore.getState().navigateTo('settings');
    expect(getGameplayInteractionGeneration()).toBe(before + 1);
    useGameStore.getState().navigateTo('settings');
    expect(getGameplayInteractionGeneration()).toBe(before + 1);

    useGameStore.getState().startPlacement('table_2seat');
    expect(useGameStore.getState().screen).toBe('restaurant');
    expect(getGameplayInteractionGeneration()).toBe(before + 2);
  });

  it('invalidates on day replacement without cancelling ordinary same-day updates', async () => {
    const beforeOpen = getGameplayInteractionGeneration();
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    expect(getGameplayInteractionGeneration()).toBe(beforeOpen + 1);

    const duringDay = getGameplayInteractionGeneration();
    useGameStore.getState().setFloorNavPosition({ x: 2, y: 5 });
    await useGameStore.getState().dispatch({
      type: 'FLOOR_SET_TABLE',
      placementId: useGameStore.getState().activeDay!.floor!.tables[0]!
        .placementId,
    });
    await useGameStore.getState().autosave();
    expect(getGameplayInteractionGeneration()).toBe(duringDay);

    const code = exportSaveCode(getGameStateSnapshot());
    expect(await useGameStore.getState().importSaveCode(code)).toEqual({
      ok: true,
    });
    expect(getGameplayInteractionGeneration()).toBe(duringDay + 1);
  });

  it('rejects a delayed delivery after an import replaces the same ticket id', async () => {
    const ticketId = await advanceToCarriedTicket();
    const replacement = structuredClone(getGameStateSnapshot());
    replacement.cash = 4321;
    const replacementCode = exportSaveCode(replacement);
    const load = deferred();
    contentControl.deliveryLoad = load.promise;

    const staleDelivery = useGameStore
      .getState()
      .dispatch({ type: 'FLOOR_DELIVER', ticketId });
    await Promise.resolve();
    await expect(
      useGameStore.getState().importSaveCode(replacementCode),
    ).resolves.toEqual({ ok: true });
    load.resolve();

    await expect(staleDelivery).rejects.toThrow(
      'gameplay context changed',
    );
    const current = useGameStore.getState();
    expect(current.cash).toBe(4321);
    expect(current.activeDay!.floor!.carriedTicketId).toBe(ticketId);
    expect(
      current.activeDay!.floor!.tickets.find((ticket) => ticket.id === ticketId)
        ?.status,
    ).toBe('plated');
    expect(current.activeDay!.customersServed).toBe(0);
  });
});
