import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import { applyPurchase, validatePlacement } from '../../domain/economy/purchases.ts';
import {
  createStarterMap,
  isDiningCell,
  isKitchenCell,
  isPerimeterWallCell,
  mapZonesForGrid,
  mainGuestEntranceReservedCells,
  perimeterWallEdge,
} from '../../domain/floor/starter-map.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import { testContext } from '../test-helpers.ts';

describe('mapZonesForGrid', () => {
  it('matches starter map zones at starter size', () => {
    const starter = createStarterMap();
    const zones = mapZonesForGrid(starter.gridSize.w, starter.gridSize.h);
    expect(zones.door).toEqual(starter.zones.door);
    expect(new Set(zones.dining.map((c) => `${c.x},${c.y}`))).toEqual(
      new Set(starter.zones.dining.map((c) => `${c.x},${c.y}`)),
    );
    expect(new Set(zones.kitchen.map((c) => `${c.x},${c.y}`))).toEqual(
      new Set(starter.zones.kitchen.map((c) => `${c.x},${c.y}`)),
    );
  });

  it('keeps door on the south perimeter after growth', () => {
    const zones = mapZonesForGrid(12, 10);
    expect(zones.door.y).toBe(9);
    expect(isPerimeterWallCell(zones.door.x, zones.door.y, 12, 10)).toBe(true);
    expect(perimeterWallEdge(zones.door.x, zones.door.y, 12, 10)).toBe('s');
    expect(isDiningCell(zones, zones.door.x, zones.door.y)).toBe(true);
  });

  it('covers every interior cell as dining or kitchen (no holes)', () => {
    const w = 11;
    const h = 9;
    const zones = mapZonesForGrid(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (isPerimeterWallCell(x, y, w, h)) continue;
        const dining = isDiningCell(zones, x, y);
        const kitchen = isKitchenCell(zones, x, y);
        expect(dining || kitchen).toBe(true);
        expect(dining && kitchen).toBe(false);
      }
    }
  });
});

describe('grid expansion keeps walls functional', () => {
  it('grows the floor and keeps a solid perimeter with a south door', () => {
    let state = createNewGameState(1);
    state = { ...state, cash: 50_000 };

    const before = { ...state.gridSize };
    state = applyPurchase(state, { type: 'grid_expansion' }, testContext);
    expect(state.gridSize.w).toBe(before.w + 1);
    expect(state.gridSize.h).toBe(before.h + 1);

    const { w, h } = state.gridSize;
    const zones = mapZonesForGrid(w, h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!isPerimeterWallCell(x, y, w, h)) continue;
        expect(perimeterWallEdge(x, y, w, h)).not.toBeNull();
      }
    }
    expect(zones.door.y).toBe(h - 1);
    expect(isPerimeterWallCell(zones.door.x, zones.door.y, w, h)).toBe(true);

    for (const p of state.placements) {
      expect(isPerimeterWallCell(p.x, p.y, w, h)).toBe(false);
      if (p.itemKey.startsWith('table')) {
        expect(isDiningCell(zones, p.x, p.y)).toBe(true);
      }
      if (p.itemKey.endsWith('_station')) {
        expect(isKitchenCell(zones, p.x, p.y)).toBe(true);
      }
    }
    for (const seat of seatsFromPlacements(state.placements)) {
      expect(isPerimeterWallCell(seat.x, seat.y, w, h)).toBe(false);
      expect(isDiningCell(zones, seat.x, seat.y)).toBe(true);
    }
  });

  it('rejects table chairs that would sit in perimeter walls after expansion', () => {
    let state = createNewGameState(1);
    state = { ...state, cash: 50_000, tableCount: 10 };
    state = applyPurchase(state, { type: 'grid_expansion' }, testContext);
    const { w, h } = state.gridSize;

    const againstWall = {
      id: 'bad_table',
      itemKey: 'table_2seat',
      x: 1,
      y: 0,
      rotation: 0,
    };
    expect(validatePlacement(state, againstWall)).toBe(false);

    const ok = {
      id: 'ok_table',
      itemKey: 'table_2seat',
      x: 3,
      y: 4,
      rotation: 0,
    };
    expect(isPerimeterWallCell(ok.x, ok.y, w, h)).toBe(false);
    expect(validatePlacement(state, ok)).toBe(true);
  });

  it('grows both dimensions without moving a valid layout into the new entrance corridor', () => {
    let state = createNewGameState(2);
    const table = state.placements.find((placement) => placement.id === 'table_1')!;
    const nearSouthWall = { ...table, x: 5, y: 6 };
    expect(validatePlacement(state, nearSouthWall, table.id)).toBe(true);
    state = {
      ...state,
      cash: 50_000,
      placements: state.placements.map((placement) =>
        placement.id === table.id ? nearSouthWall : placement,
      ),
    };
    const before = { ...state.gridSize };

    state = applyPurchase(state, { type: 'grid_expansion' }, testContext);

    expect(state.gridSize).toEqual({ w: before.w + 1, h: before.h + 1 });
    expect(state.placements.find((placement) => placement.id === table.id)).toEqual(
      nearSouthWall,
    );
    const reserved = new Set(
      mainGuestEntranceReservedCells(state.gridSize.w, state.gridSize.h).map(
        (cell) => `${cell.x},${cell.y}`,
      ),
    );
    for (const placement of state.placements) {
      expect(reserved.has(`${placement.x},${placement.y}`)).toBe(false);
    }
    for (const seat of seatsFromPlacements(state.placements)) {
      expect(reserved.has(`${seat.x},${seat.y}`)).toBe(false);
    }
  });
});
