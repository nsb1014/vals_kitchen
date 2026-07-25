import { describe, expect, it } from 'vitest';
import { canonicalize } from '../persistence/serialize.ts';
import { createSaveRepository, type StorageAdapter } from '../persistence/SaveRepository.ts';
import { gameReducer } from '../domain/reducer.ts';
import { createNewGameState } from '../domain/state/game-state.ts';
import { testContext } from './test-helpers.ts';

function createMemoryStorage(): StorageAdapter {
  const map = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => map.get(key) as T | undefined,
    set: async (key: string, value: unknown) => {
      map.set(key, value);
    },
    del: async (key: string) => {
      map.delete(key);
    },
  };
}

describe('layout persistence', () => {
  it('round-trips modified placements through save/load', async () => {
    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    let state = createNewGameState(777);

    const table = state.placements[0]!;
    state = gameReducer(
      state,
      { type: 'MOVE_ITEM', placementId: table.id, x: 1, y: 2 },
      testContext,
    ).state;

    await repo.save(state);
    const loaded = (await repo.load()).state!;
    expect(canonicalize(loaded.placements)).toBe(canonicalize(state.placements));
    expect(loaded.seatingCapacity).toBe(state.seatingCapacity);
    expect(loaded.placements.find((item) => item.id === table.id)).toEqual({
      ...table,
      x: 1,
      y: 2,
    });
  });
});
