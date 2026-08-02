import { beforeEach, describe, expect, it } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import { useGameStore } from '../../store/game-store.ts';
import '../test-helpers.ts';

function resetStore(): void {
  useGameStore.setState({
    ...createNewGameState(5917),
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

describe('store floor dispatch timing', () => {
  beforeEach(() => {
    resetStore();
  });

  it('applies content-independent floor completion before its promise is awaited', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    expect(
      useGameStore.getState().activeDay!.floor!.pool.some((guest) => guest.stage === 'entering'),
    ).toBe(true);

    const completion = useGameStore
      .getState()
      .dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });

    expect(
      useGameStore.getState().activeDay!.floor!.pool.some((guest) => guest.stage === 'waiting'),
    ).toBe(true);
    await completion;
  });

  it('still awaits content-gated actions before reducing them', async () => {
    const opening = useGameStore.getState().dispatch({ type: 'OPEN_DAY' });

    expect(useGameStore.getState().activeDay).toBeNull();
    await opening;
    expect(useGameStore.getState().activeDay).not.toBeNull();
  });
});
