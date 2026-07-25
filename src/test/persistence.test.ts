import { describe, expect, it } from 'vitest';
import { canonicalize } from '../persistence/serialize.ts';
import { exportSaveCode, parseSaveCode } from '../persistence/saveCode.ts';
import { createSaveRepository, type StorageAdapter } from '../persistence/SaveRepository.ts';
import { createNewGameState } from '../domain/state/game-state.ts';
import { gameReducer } from '../domain/reducer.ts';
import { findBestMatchCombo } from '../domain/day/customer-request-generator.ts';
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

describe('persistence', () => {
  it('round-trips state through repository save/load', async () => {
    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    const original = createNewGameState(12345);
    original.cash = 1337;
    original.discoveredRecipeIds = ['r1'];

    await repo.save(original);
    const loaded = await repo.load();
    expect(loaded.state).not.toBeNull();
    expect(canonicalize(loaded.state)).toBe(canonicalize(original));
  });

  it('round-trips Save Code export/import', () => {
    const original = createNewGameState(54321);
    original.prestige = 2;
    original.activeDay = null;
    const code = exportSaveCode(original, '2026-07-24T00:00:00.000Z');
    expect(code.startsWith('RS1.')).toBe(true);
    const imported = parseSaveCode(code);
    expect(canonicalize(imported)).toBe(canonicalize(original));
  });

  it('rejects corrupt and truncated Save Codes', () => {
    const code = exportSaveCode(createNewGameState(1));
    expect(() => parseSaveCode('BAD.code')).toThrow(/RS1/);
    expect(() => parseSaveCode('RS1.')).toThrow();
    expect(() => parseSaveCode(`RS1.${code.slice(4, 40)}`)).toThrow();
  });

  it('restores mid-day progress including compose draft', async () => {
    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    let state = gameReducer(createNewGameState(9090), { type: 'OPEN_DAY' }, testContext).state;
    const customer = state.activeDay!.customers[0]!;
    const best = findBestMatchCombo(
      state.unlockedIngredientIds,
      customer.preference,
      testContext.ingredientsById,
      testContext.compoundAffinity,
    );
    const draftIds = best.ingredientIds.slice(0, 3);
    state = gameReducer(state, { type: 'SET_COMPOSE_DRAFT', ingredientIds: draftIds }, testContext).state;

    await repo.save(state);
    const loaded = (await repo.load()).state!;
    expect(loaded.activeDay?.seed).toBe(state.activeDay?.seed);
    expect(loaded.activeDay?.queueIndex).toBe(0);
    expect(loaded.composeDraftIngredientIds).toEqual(draftIds);

    const resumed = gameReducer(loaded, { type: 'SERVE_DISH', ingredientIds: draftIds }, testContext).state;
    expect(resumed.activeDay?.customersServed).toBe(1);
    expect(resumed.composeDraftIngredientIds).toBeUndefined();
    expect(resumed.activeDay?.queueIndex).toBe(0);
  });

  it('falls back to backup when primary save is corrupt', async () => {
    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    const good = createNewGameState(2020);
    await repo.save(good);
    await repo.save(good);
    await storage.set('restaurant-save', { saveVersion: 1, checksum: 'deadbeef', gameState: {} });

    const loaded = await repo.load();
    expect(loaded.source).toBe('backup');
    expect(canonicalize(loaded.state)).toBe(canonicalize(good));
  });
});
