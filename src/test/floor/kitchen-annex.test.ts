import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import { applyPurchase, validatePlacement } from '../../domain/economy/purchases.ts';
import {
  createStarterMap,
  isDiningCell,
  isKitchenCell,
  isPerimeterWallCell,
  KITCHEN_ANNEX_EXTRA_WIDTH,
  kitchenWidthForGrid,
  mapZonesForGrid,
  STARTER_KITCHEN_WIDTH,
} from '../../domain/floor/starter-map.ts';
import { findPath } from '../../domain/floor/pathfinding.ts';
import { walkBlockedCells } from '../../canvas/world/blocked-cells.ts';
import { EQUIPMENT_IDS } from '../../domain/types.ts';
import { testContext } from '../test-helpers.ts';
import type { Placement } from '../../domain/state/game-state.ts';

describe('kitchen annex unlock', () => {
  it('widens kitchen without shrinking dining or moving the door', () => {
    const starter = createStarterMap();
    const before = mapZonesForGrid(starter.gridSize.w, starter.gridSize.h);
    const afterW = starter.gridSize.w + KITCHEN_ANNEX_EXTRA_WIDTH;
    const after = mapZonesForGrid(afterW, starter.gridSize.h, { kitchenAnnexOwned: true });

    expect(kitchenWidthForGrid({ kitchenAnnexOwned: true })).toBe(
      STARTER_KITCHEN_WIDTH + KITCHEN_ANNEX_EXTRA_WIDTH,
    );
    expect(before.dining.length).toBe(after.dining.length);
    expect(after.kitchen.length).toBeGreaterThan(before.kitchen.length);
    expect(after.door).toEqual(before.door);

    for (let y = 1; y < starter.gridSize.h - 1; y++) {
      expect(isKitchenCell(after, afterW - 2, y)).toBe(true);
      expect(isDiningCell(after, afterW - 2, y)).toBe(false);
    }
  });

  it('purchase grows width and allows stations in the annex zone', () => {
    let state = createNewGameState(1);
    state = { ...state, cash: 50_000 };
    const beforeW = state.gridSize.w;
    const beforeDining = mapZonesForGrid(beforeW, state.gridSize.h).dining.length;

    state = applyPurchase(state, { type: 'kitchen_annex' }, testContext);
    expect(state.kitchenAnnexOwned).toBe(true);
    expect(state.gridSize.w).toBe(beforeW + KITCHEN_ANNEX_EXTRA_WIDTH);
    expect(state.gridSize.h).toBe(8);

    const zones = mapZonesForGrid(state.gridSize.w, state.gridSize.h, {
      kitchenAnnexOwned: true,
    });
    expect(zones.dining.length).toBe(beforeDining);
    expect(isPerimeterWallCell(zones.door.x, zones.door.y, state.gridSize.w, state.gridSize.h)).toBe(
      true,
    );

    const annexStation = {
      id: 'station_grill',
      itemKey: 'grill',
      x: state.gridSize.w - 2,
      y: 3,
      rotation: 0,
    };
    expect(isKitchenCell(zones, annexStation.x, annexStation.y)).toBe(true);
    expect(validatePlacement(state, annexStation)).toBe(true);
    expect(validatePlacement(state, { ...annexStation, x: 3, itemKey: 'grill' })).toBe(false);
  });

  it('keeps 12 stations pathable after annex (walk corridor remains)', () => {
    let state = createNewGameState(1);
    state = { ...state, cash: 50_000 };
    state = applyPurchase(state, { type: 'kitchen_annex' }, testContext);

    const { w, h } = state.gridSize;
    const zones = mapZonesForGrid(w, h, { kitchenAnnexOwned: true });
    const kitchenInterior = zones.kitchen.filter(
      (c) => !isPerimeterWallCell(c.x, c.y, w, h),
    );
    expect(kitchenInterior.length).toBeGreaterThanOrEqual(24);

    const xs = [...new Set(kitchenInterior.map((c) => c.x))].sort((a, b) => a - b);
    expect(xs.length).toBeGreaterThanOrEqual(4);
    const leftCol = xs[0]!;
    const rightCol = xs[xs.length - 1]!;
    const aisleX = xs[1]!;

    // Pack all 12 stations on the outer kitchen columns; keep an aisle between.
    const stationKeys = [...EQUIPMENT_IDS];
    const placements: Placement[] = state.placements.filter((p) => p.itemKey.startsWith('table'));
    let si = 0;
    for (const x of [leftCol, rightCol]) {
      for (let y = 1; y <= 6 && si < stationKeys.length; y++) {
        placements.push({
          id: `station_${stationKeys[si]}`,
          itemKey: stationKeys[si]!,
          x,
          y,
          rotation: 0,
        });
        si += 1;
      }
    }
    expect(si).toBe(12);

    const blocked = walkBlockedCells(placements, w, h, { kitchenAnnexOwned: true });
    expect(blocked.has(`${aisleX},3`)).toBe(false);

    const from = { x: aisleX, y: 1 };
    const to = { x: aisleX, y: 6 };
    const path = findPath({ w, h, blocked }, from, to);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1);

    // Player can reach beside every station (adjacent aisle cell).
    for (const p of placements.filter((item) => !item.itemKey.startsWith('table'))) {
      const side = { x: aisleX, y: p.y };
      expect(findPath({ w, h, blocked }, from, side)).not.toBeNull();
    }
  });
});
