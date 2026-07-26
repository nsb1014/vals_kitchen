import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import {
  applyPurchase,
  applyTransferItemRoom,
  findTransferDropCell,
  isConnectingDoorCell,
  validatePlacement,
} from '../../domain/economy/purchases.ts';
import {
  connectingDoorForMain,
  connectingDoorForBackKitchen,
  createStarterMap,
  isKitchenCell,
  isPerimeterWallCell,
  kitchenWidthForGrid,
  mapZonesForGrid,
  openDoorCellsForRoom,
  STARTER_KITCHEN_WIDTH,
} from '../../domain/floor/starter-map.ts';
import { findPath } from '../../domain/floor/pathfinding.ts';
import { walkBlockedCells } from '../../canvas/world/blocked-cells.ts';
import { EQUIPMENT_IDS } from '../../domain/types.ts';
import { testContext } from '../test-helpers.ts';
import type { Placement } from '../../domain/state/game-state.ts';

describe('kitchen annex unlock (separate back-kitchen room)', () => {
  it('does not widen the main map; kitchen width stays starter depth', () => {
    const starter = createStarterMap();
    const before = mapZonesForGrid(starter.gridSize.w, starter.gridSize.h);
    const after = mapZonesForGrid(starter.gridSize.w, starter.gridSize.h, {
      room: 'main',
    });

    expect(kitchenWidthForGrid()).toBe(STARTER_KITCHEN_WIDTH);
    expect(after.dining.length).toBe(before.dining.length);
    expect(after.kitchen.length).toBe(before.kitchen.length);
    expect(after.door).toEqual(before.door);
  });

  it('purchase unlocks connecting door without growing grid size', () => {
    let state = createNewGameState(1);
    state = { ...state, cash: 50_000 };
    const beforeW = state.gridSize.w;
    const beforeH = state.gridSize.h;

    state = applyPurchase(state, { type: 'kitchen_annex' }, testContext);
    expect(state.kitchenAnnexOwned).toBe(true);
    expect(state.gridSize).toEqual({ w: beforeW, h: beforeH });
    expect(state.backKitchenPlacements).toEqual([]);

    const mainDoor = connectingDoorForMain(state.gridSize.w, state.gridSize.h);
    const backDoor = connectingDoorForBackKitchen(state.gridSize.w, state.gridSize.h);
    expect(isPerimeterWallCell(mainDoor.x, mainDoor.y, state.gridSize.w, state.gridSize.h)).toBe(
      true,
    );
    expect(isConnectingDoorCell(state, 'main', mainDoor.x, mainDoor.y)).toBe(true);
    expect(isConnectingDoorCell(state, 'back_kitchen', backDoor.x, backDoor.y)).toBe(true);

    const openMain = openDoorCellsForRoom('main', state.gridSize.w, state.gridSize.h, true);
    expect(openMain).toContainEqual(mainDoor);
    expect(openMain).toContainEqual(mapZonesForGrid(state.gridSize.w, state.gridSize.h).door);
  });

  it('gates back-kitchen placement until annex is owned', () => {
    const locked = createNewGameState(2);
    const station: Placement = {
      id: 'station_grill',
      itemKey: 'grill',
      x: 2,
      y: 3,
      rotation: 0,
    };
    expect(validatePlacement(locked, station, undefined, 'back_kitchen')).toBe(false);

    let owned = { ...locked, cash: 50_000 };
    owned = applyPurchase(owned, { type: 'kitchen_annex' }, testContext);
    expect(validatePlacement(owned, station, undefined, 'back_kitchen')).toBe(true);
    expect(validatePlacement(owned, { ...station, itemKey: 'table_2seat' }, undefined, 'back_kitchen')).toBe(
      false,
    );
  });

  it('switches rooms via connecting door cells and keeps walkability', () => {
    let state = createNewGameState(3);
    state = { ...state, cash: 50_000 };
    state = applyPurchase(state, { type: 'kitchen_annex' }, testContext);
    const { w, h } = state.gridSize;
    const mainDoor = connectingDoorForMain(w, h);
    const interior = { x: mainDoor.x - 1, y: mainDoor.y };

    const blocked = walkBlockedCells(state.placements, w, h, {
      kitchenAnnexOwned: true,
      room: 'main',
    });
    expect(blocked.has(`${mainDoor.x},${mainDoor.y}`)).toBe(false);
    expect(findPath({ w, h, blocked }, interior, mainDoor)).not.toBeNull();

    const backBlocked = walkBlockedCells([], w, h, {
      kitchenAnnexOwned: true,
      room: 'back_kitchen',
    });
    const backDoor = connectingDoorForBackKitchen(w, h);
    expect(backBlocked.has(`${backDoor.x},${backDoor.y}`)).toBe(false);
  });

  it('transfers a station across rooms when dropped on the connecting door', () => {
    let state = createNewGameState(4);
    state = { ...state, cash: 50_000 };
    state = applyPurchase(state, { type: 'kitchen_annex' }, testContext);

    const prep = state.placements.find((p) => p.itemKey === 'prep_station')!;
    const drop = findTransferDropCell(state, 'back_kitchen');
    expect(drop).not.toBeNull();

    state = applyTransferItemRoom(state, prep.id, 'main', 'back_kitchen', drop!.x, drop!.y);
    expect(state.placements.find((p) => p.id === prep.id)).toBeUndefined();
    const moved = state.backKitchenPlacements.find((p) => p.id === prep.id);
    expect(moved).toMatchObject({ x: drop!.x, y: drop!.y, itemKey: 'prep_station' });

    const backZones = mapZonesForGrid(state.gridSize.w, state.gridSize.h, {
      room: 'back_kitchen',
    });
    expect(isKitchenCell(backZones, moved!.x, moved!.y)).toBe(true);

    const returnDrop = findTransferDropCell(state, 'main');
    expect(returnDrop).not.toBeNull();
    state = applyTransferItemRoom(
      state,
      prep.id,
      'back_kitchen',
      'main',
      returnDrop!.x,
      returnDrop!.y,
    );
    expect(state.backKitchenPlacements.find((p) => p.id === prep.id)).toBeUndefined();
    expect(state.placements.find((p) => p.id === prep.id)).toMatchObject({
      x: returnDrop!.x,
      y: returnDrop!.y,
    });
  });

  it('keeps 12 stations pathable by splitting across main + back kitchen', () => {
    let state = createNewGameState(5);
    state = { ...state, cash: 50_000 };
    state = applyPurchase(state, { type: 'kitchen_annex' }, testContext);

    const { w, h } = state.gridSize;
    const mainZones = mapZonesForGrid(w, h, { room: 'main' });
    const backZones = mapZonesForGrid(w, h, { room: 'back_kitchen' });
    const mainKitchen = mainZones.kitchen.filter((c) => !isPerimeterWallCell(c.x, c.y, w, h));
    const backKitchen = backZones.kitchen.filter((c) => !isPerimeterWallCell(c.x, c.y, w, h));
    expect(mainKitchen.length + backKitchen.length).toBeGreaterThanOrEqual(24);

    const door = connectingDoorForMain(w, h);
    const corridorY = door.y;
    const stationKeys = [...EQUIPMENT_IDS];
    const mainPlacements: Placement[] = state.placements.filter((p) =>
      p.itemKey.startsWith('table'),
    );
    const backPlacements: Placement[] = [];
    let si = 0;
    // Pack main kitchen but leave the east-door corridor row open.
    for (const cell of mainKitchen) {
      if (si >= 6) break;
      if (cell.y === corridorY) continue;
      mainPlacements.push({
        id: `station_${stationKeys[si]}`,
        itemKey: stationKeys[si]!,
        x: cell.x,
        y: cell.y,
        rotation: 0,
      });
      si += 1;
    }
    for (const cell of backKitchen) {
      if (si >= 12) break;
      if (cell.y === corridorY && cell.x === 1) continue;
      backPlacements.push({
        id: `station_${stationKeys[si]}`,
        itemKey: stationKeys[si]!,
        x: cell.x,
        y: cell.y,
        rotation: 0,
      });
      si += 1;
    }
    expect(si).toBe(12);

    const mainBlocked = walkBlockedCells(mainPlacements, w, h, {
      kitchenAnnexOwned: true,
      room: 'main',
    });
    const from = { x: door.x - 1, y: corridorY };
    expect(mainBlocked.has(`${from.x},${from.y}`)).toBe(false);
    expect(findPath({ w, h, blocked: mainBlocked }, from, door)).not.toBeNull();

    const backBlocked = walkBlockedCells(backPlacements, w, h, {
      kitchenAnnexOwned: true,
      room: 'back_kitchen',
    });
    const backDoor = connectingDoorForBackKitchen(w, h);
    const backInterior = { x: 1, y: backDoor.y };
    expect(findPath({ w, h, blocked: backBlocked }, backInterior, backDoor)).not.toBeNull();
  });
});
