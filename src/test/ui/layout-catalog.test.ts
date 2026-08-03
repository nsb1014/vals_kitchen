import { describe, expect, it, vi } from 'vitest';
import { purchaseCost } from '../../domain/economy/purchases.ts';
import { createNewGameState } from '../../domain/state/game-state.ts';
import { purchaseAndStartPlacement } from '../../ui/components/LayoutToolbar.ts';
import type { GameStore } from '../../store/game-store.ts';
import { buildLayoutCatalogRows, selectShowLayoutHud } from '../../store/selectors/layout.ts';
import { selectUnplacedItems } from '../../store/selectors/shop.ts';
import { testContext } from '../test-helpers.ts';

function storeStub(overrides: Partial<GameStore> = {}): GameStore {
  return {
    ...createNewGameState(901),
    screen: 'restaurant',
    activeDay: null,
    daySummary: null,
    editLayoutMode: false,
    ...overrides,
  } as GameStore;
}

describe('layout HUD visibility', () => {
  it('is visible only while editing between days on the restaurant floor', () => {
    expect(selectShowLayoutHud(storeStub())).toBe(false);
    expect(selectShowLayoutHud(storeStub({ editLayoutMode: true }))).toBe(true);
    expect(selectShowLayoutHud(storeStub({ editLayoutMode: true, screen: 'shop' }))).toBe(false);
    expect(
      selectShowLayoutHud(
        storeStub({
          editLayoutMode: true,
          activeDay: { day: 1 } as unknown as GameStore['activeDay'],
        }),
      ),
    ).toBe(false);
    expect(
      selectShowLayoutHud(
        storeStub({
          editLayoutMode: true,
          daySummary: { day: 1 } as unknown as GameStore['daySummary'],
        }),
      ),
    ).toBe(false);
  });
});

describe('edit-mode catalog', () => {
  it('builds a current-price table row and flat-price decor rows', () => {
    const state = createNewGameState(902);
    state.cash = 10_000;

    const rows = buildLayoutCatalogRows(state, testContext);
    const table = rows.find((row) => row.kind === 'table');
    const decor = rows.filter((row) => row.kind === 'decor');

    expect(table).toMatchObject({
      itemKey: 'table_2seat',
      label: 'Table (2 seats)',
      cost: purchaseCost(state, { type: 'table' }),
      availability: 'available',
    });
    expect(decor.map((row) => [row.itemKey, row.cost])).toEqual([
      ['decor_plant', 50],
      ['decor_flowers', 75],
      ['decor_rug', 120],
      ['decor_lamp', 150],
      ['decor_sign', 200],
    ]);
  });

  it('distinguishes unaffordable decorations from the ownership cap', () => {
    const poor = createNewGameState(903);
    poor.cash = 60;
    const poorRows = buildLayoutCatalogRows(poor, testContext);
    expect(poorRows.find((row) => row.itemKey === 'decor_plant')?.availability).toBe('available');
    expect(poorRows.find((row) => row.itemKey === 'decor_flowers')?.availability).toBe(
      'unaffordable',
    );

    const capped = createNewGameState(904);
    capped.cash = 10_000;
    capped.decorPurchasedCounts.decor_plant = 6;
    expect(
      buildLayoutCatalogRows(capped, testContext)
        .filter((row) => row.kind === 'decor')
        .every((row) => row.availability === 'cap_reached'),
    ).toBe(true);
  });

  it('lists purchased decorations that have not been placed', () => {
    const state = createNewGameState(905);
    state.decorPurchasedCounts.decor_flowers = 2;
    state.placements.push({
      id: 'placed_flowers',
      itemKey: 'decor_flowers',
      x: 1,
      y: 4,
      rotation: 0,
    });

    const rows = selectUnplacedItems(state as GameStore, new Map());
    expect(rows.filter((row) => row.itemKey === 'decor_flowers')).toEqual([
      {
        itemKey: 'decor_flowers',
        label: 'Flowers',
        kind: 'decor',
      },
    ]);
  });

  it('purchases before beginning placement', async () => {
    const calls: string[] = [];
    const store = {
      dispatch: vi.fn(async () => {
        calls.push('purchase');
      }),
      setActiveFloorRoom: vi.fn(() => {
        calls.push('room');
      }),
      startPlacement: vi.fn(() => {
        calls.push('place');
      }),
    } as unknown as Pick<
      GameStore,
      'dispatch' | 'setActiveFloorRoom' | 'startPlacement'
    >;

    await purchaseAndStartPlacement(
      store,
      { type: 'decor', itemKey: 'decor_lamp' },
      'decor_lamp',
      'main',
    );

    expect(calls).toEqual(['purchase', 'room', 'place']);
    expect(store.dispatch).toHaveBeenCalledWith({
      type: 'PURCHASE',
      purchase: { type: 'decor', itemKey: 'decor_lamp' },
    });
    expect(store.setActiveFloorRoom).toHaveBeenCalledWith('main');
    expect(store.startPlacement).toHaveBeenCalledWith('decor_lamp');
  });

  it('keeps a failed purchase out of room and placement state', async () => {
    const store = {
      dispatch: vi.fn(async () => Promise.reject(new Error('unavailable'))),
      setActiveFloorRoom: vi.fn(),
      startPlacement: vi.fn(),
    } as unknown as Pick<
      GameStore,
      'dispatch' | 'setActiveFloorRoom' | 'startPlacement'
    >;

    await expect(
      purchaseAndStartPlacement(
        store,
        { type: 'table' },
        'table_2seat',
        'main',
      ),
    ).rejects.toThrow('unavailable');
    expect(store.setActiveFloorRoom).not.toHaveBeenCalled();
    expect(store.startPlacement).not.toHaveBeenCalled();
  });
});
