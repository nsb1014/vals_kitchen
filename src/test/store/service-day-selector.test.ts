import { beforeEach, describe, expect, it } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import { useGameStore } from '../../store/game-store.ts';
import { selectCanOpenFloorCompose } from '../../store/selectors/service-day.ts';
import '../test-helpers.ts';

describe('service-day selectors', () => {
  beforeEach(() => {
    useGameStore.setState({
      ...createNewGameState(8118),
      screen: 'restaurant',
      editLayoutMode: false,
      activeFloorRoom: 'back_kitchen',
      hydrated: true,
      persistGranted: false,
      modifierDismissed: true,
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
      floorPlayerGrid: { x: 1, y: 2 },
      floorToast: null,
      celebrationQueue: [],
      composeSheetOpen: false,
    });
  });

  it('requires a nearby canonical station to be owned before compose can open', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    const state = useGameStore.getState();
    const customerId = state.activeDay!.customers[0]!.id;
    useGameStore.setState({
      modifierDismissed: true,
      activeFloorRoom: 'back_kitchen',
      floorPlayerGrid: { x: 1, y: 2 },
      backKitchenPlacements: [
        { id: 'injected_grill', itemKey: 'grill', x: 2, y: 2, rotation: 0 },
      ],
      activeDay: {
        ...state.activeDay!,
        floor: {
          ...state.activeDay!.floor!,
          tickets: [
            {
              id: 'ticket_1',
              customerId,
              ingredientIds: [],
              status: 'open',
            },
          ],
          selectedTicketId: 'ticket_1',
        },
      },
    });

    expect(useGameStore.getState().purchasedEquipmentIds).not.toContain('grill');
    expect(selectCanOpenFloorCompose(useGameStore.getState())).toBe(false);

    useGameStore.setState({
      purchasedEquipmentIds: [
        ...useGameStore.getState().purchasedEquipmentIds,
        'grill',
      ],
    });
    expect(selectCanOpenFloorCompose(useGameStore.getState())).toBe(true);
  });
});
