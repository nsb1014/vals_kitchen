import { beforeEach, describe, expect, it } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import { getGameStateSnapshot, useGameStore } from '../../store/game-store.ts';
import '../test-helpers.ts';

describe('delivery room boundary', () => {
  beforeEach(() => {
    useGameStore.setState({
      ...createNewGameState(4815),
      screen: 'restaurant',
      activeFloorRoom: 'main',
      hydrated: true,
    });
  });

  it('rejects delivery from the back kitchen before mutating game state', async () => {
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
    useGameStore.setState({ activeFloorRoom: 'back_kitchen' });
    const before = getGameStateSnapshot();

    await expect(
      useGameStore
        .getState()
        .dispatch({ type: 'FLOOR_DELIVER', ticketId: 'unreachable_ticket' }),
    ).rejects.toThrow('main dining floor');
    expect(getGameStateSnapshot()).toEqual(before);
  });
});
