import { describe, expect, it } from 'vitest';
import { canonicalize } from '../persistence/serialize.ts';
import { SAVE_KEY, computeChecksum } from '../persistence/serialize.ts';
import { exportSaveCode, migrateSave, parseSaveCode } from '../persistence/saveCode.ts';
import { createSaveRepository, type StorageAdapter } from '../persistence/SaveRepository.ts';
import { createNewGameState, CURRENT_SAVE_VERSION, normalizeGameState } from '../domain/state/game-state.ts';
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
      state = gameReducer(state, { type: 'FLOOR_SET_TABLE', placementId: table.placementId }, testContext).state;
    }
    state = gameReducer(state, { type: 'FLOOR_COMPLETE_ENTERING' }, testContext).state;
    state = gameReducer(state, { type: 'FLOOR_SEAT_NEXT' }, testContext).state;
    const seating = state.activeDay!.floor!.pool.find((g) => g.stage === 'seating')!;
    state = gameReducer(state, { type: 'FLOOR_COMPLETE_SEATING', guestId: seating.id }, testContext).state;
    const seated = state.activeDay!.floor!.pool.find((g) => g.stage === 'seated')!;
    state = {
      ...state,
      activeDay: {
        ...state.activeDay!,
        floor: {
          ...state.activeDay!.floor!,
          playerPosition: { ...seated.seat! },
        },
      },
    };
    state = gameReducer(state, { type: 'FLOOR_TAKE_ORDERS', customerIds: [seated.customer.id] }, testContext).state;

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

  it('restores in-flight seating with its reserved seat and occupied table', async () => {
    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    let state = gameReducer(createNewGameState(7878), { type: 'OPEN_DAY' }, testContext).state;

    for (const table of state.activeDay!.floor!.tables) {
      state = gameReducer(state, { type: 'FLOOR_SET_TABLE', placementId: table.placementId }, testContext).state;
    }
    state = gameReducer(state, { type: 'FLOOR_COMPLETE_ENTERING' }, testContext).state;
    state = gameReducer(state, { type: 'FLOOR_SEAT_NEXT' }, testContext).state;

    const seating = state.activeDay!.floor!.pool.find((guest) => guest.stage === 'seating')!;
    const motionPosition = { x: 4, y: 5 };
    state = gameReducer(
      state,
      {
        type: 'FLOOR_UPDATE_GUEST_MOTION_POSITION',
        guestId: seating.id,
        position: motionPosition,
      },
      testContext,
    ).state;
    expect(seating.seat).toBeDefined();
    expect(
      state.activeDay!.floor!.tables.find((table) => table.placementId === seating.seat!.tablePlacementId)?.state,
    ).toBe('occupied');

    await repo.save(state);
    const loaded = (await repo.load()).state!;
    const resumed = loaded.activeDay!.floor!.pool.find((guest) => guest.id === seating.id)!;
    expect(resumed.stage).toBe('seating');
    expect(resumed.seat).toEqual(seating.seat);
    expect(resumed.motionPosition).toEqual(motionPosition);
    expect(
      loaded.activeDay!.floor!.tables.find((table) => table.placementId === resumed.seat!.tablePlacementId)?.state,
    ).toBe('occupied');
  });

  it('restores a leaving guest at their seat before departure completes', async () => {
    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    const state = gameReducer(createNewGameState(7979), { type: 'OPEN_DAY' }, testContext).state;
    const floor = state.activeDay!.floor!;
    const guest = floor.pool[0]!;
    const seat = floor.seats[0]!;
    const leavingState = {
      ...state,
      activeDay: {
        ...state.activeDay!,
        floor: {
          ...floor,
          pool: floor.pool.map((candidate) =>
            candidate.id === guest.id
              ? {
                  ...candidate,
                  stage: 'leaving' as const,
                  seat: { ...seat },
                  motionPosition: { x: seat.x + 1, y: seat.y + 1 },
                  eatTicksRemaining: 0,
                }
              : candidate,
          ),
          tables: floor.tables.map((table) =>
            table.placementId === seat.tablePlacementId ? { ...table, state: 'occupied' as const } : table,
          ),
        },
      },
    };

    await repo.save(leavingState);
    const loaded = (await repo.load()).state!;
    const resumed = loaded.activeDay!.floor!.pool.find((candidate) => candidate.id === guest.id)!;
    expect(resumed.stage).toBe('leaving');
    expect(resumed.seat).toEqual(seat);
    expect(resumed.motionPosition).toEqual({ x: seat.x + 1, y: seat.y + 1 });
    expect(loaded.activeDay!.floor!.tables.find((table) => table.placementId === seat.tablePlacementId)?.state).toBe(
      'occupied',
    );
  });

  it('migrates v1 saves through to current with empty recipeMastery', () => {
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
    expect(migrated.saveVersion).toBe(CURRENT_SAVE_VERSION);
    expect(migrated.gameState.recipeMastery).toEqual({});
    expect(migrated.gameState.prestige).toBe(1);
  });

  it('migrates width-annex v2 saves into a same-size back kitchen room', () => {
    const starterW = createNewGameState(1).gridSize.w;
    const wide = createNewGameState(4242);
    wide.kitchenAnnexOwned = true;
    wide.gridSize = { w: starterW + 2, h: wide.gridSize.h };
    wide.placements = [
      ...wide.placements.filter((p) => p.itemKey.startsWith('table') || p.itemKey === 'prep_station'),
      { id: 'annex_grill', itemKey: 'grill', x: starterW, y: 3, rotation: 0 },
    ];
    delete (wide as { backKitchenPlacements?: unknown }).backKitchenPlacements;

    const envelope = {
      saveVersion: 2,
      checksum: computeChecksum(wide),
      createdAt: '2026-07-26T00:00:00.000Z',
      gameState: wide,
    };
    const migrated = migrateSave(envelope);
    expect(migrated.saveVersion).toBe(CURRENT_SAVE_VERSION);

    const loaded = normalizeGameState(migrated.gameState);
    expect(loaded.kitchenAnnexOwned).toBe(true);
    expect(loaded.gridSize.w).toBe(starterW);
    expect(loaded.backKitchenPlacements.some((p) => p.id === 'annex_grill')).toBe(true);
    expect(loaded.placements.some((p) => p.id === 'annex_grill')).toBe(false);
  });
  it('falls back to backup when primary save is corrupt', async () => {
    const storage = createMemoryStorage();
    const repo = createSaveRepository(storage);
    const good = createNewGameState(2020);
    await repo.save(good);
    await repo.save(good);
    await storage.set('restaurant-save', {
      saveVersion: 1,
      checksum: 'deadbeef',
      gameState: {},
    });

    const loaded = await repo.load();
    expect(loaded.source).toBe('backup');
    expect(canonicalize(loaded.state)).toBe(canonicalize(good));
  });
});
