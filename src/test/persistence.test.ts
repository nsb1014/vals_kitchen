import { describe, expect, it } from 'vitest';
import { canonicalize } from '../persistence/serialize.ts';
import { SAVE_KEY } from '../persistence/serialize.ts';
import { exportSaveCode, migrateSave, parseSaveCode } from '../persistence/saveCode.ts';
import { createSaveRepository, type StorageAdapter } from '../persistence/SaveRepository.ts';
import { createNewGameState, CURRENT_SAVE_VERSION } from '../domain/state/game-state.ts';
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

  it('restores mid-day floor progress including tickets and player position', async () => {
    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    let state = gameReducer(createNewGameState(7777), { type: 'OPEN_DAY' }, testContext).state;
    const floorBefore = state.activeDay!.floor!;
    expect(floorBefore).toBeTruthy();

    for (const table of floorBefore.tables) {
      state = gameReducer(state, { type: 'FLOOR_SET_TABLE', placementId: table.placementId }, testContext)
        .state;
    }
    state = gameReducer(state, { type: 'FLOOR_SEAT_NEXT' }, testContext).state;
    const seated = state.activeDay!.floor!.pool.find((g) => g.stage === 'seated')!;
    state = gameReducer(
      state,
      { type: 'FLOOR_TAKE_ORDERS', customerIds: [seated.customer.id] },
      testContext,
    ).state;

    const ticket = state.activeDay!.floor!.tickets[0]!;
    state = gameReducer(
      state,
      {
        type: 'FLOOR_PLATE',
        ticketId: ticket.id,
        ingredientIds: state.unlockedIngredientIds.slice(0, 3),
      },
      testContext,
    ).state;

    const mutatedFloor = state.activeDay!.floor!;
    expect(mutatedFloor.carriedTicketId).toBe(ticket.id);
    expect(mutatedFloor.pool.some((g) => g.stage === 'ordered')).toBe(true);

    await repo.save(state);
    const envelope = await storage.get<{ saveVersion: number }>(SAVE_KEY);
    expect(envelope?.saveVersion).toBe(CURRENT_SAVE_VERSION);

    const loaded = (await repo.load()).state!;
    const floor = loaded.activeDay?.floor;
    expect(floor).toBeTruthy();
    expect(floor!.pool.map((g) => ({ id: g.customer.id, stage: g.stage }))).toEqual(
      mutatedFloor.pool.map((g) => ({ id: g.customer.id, stage: g.stage })),
    );
    expect(floor!.tickets).toEqual(mutatedFloor.tickets);
    expect(floor!.carriedTicketId).toBe(ticket.id);
    expect(floor!.playerPosition).toEqual(mutatedFloor.playerPosition);
    expect(floor!.tables.length).toBeGreaterThan(0);
    expect(floor!.seats.length).toBeGreaterThan(0);
    expect(canonicalize(loaded.activeDay?.floor)).toBe(canonicalize(mutatedFloor));
  });

  it('migrates v1 saves to v2 with empty recipeMastery', () => {
    const v1 = createNewGameState(111);
    v1.prestige = 1;
    delete (v1 as { recipeMastery?: unknown }).recipeMastery;
    const envelope = {
      saveVersion: 1 as const,
      checksum: '',
      createdAt: '2026-07-25T00:00:00.000Z',
      gameState: v1,
    };
    const migrated = migrateSave(envelope);
    expect(migrated.saveVersion).toBe(2);
    expect(migrated.gameState.recipeMastery).toEqual({});
    expect(migrated.gameState.prestige).toBe(1);
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
