import { describe, expect, it } from 'vitest';
import { findPath } from '../../domain/floor/pathfinding.ts';
import {
  createStarterMap,
  doorForGrid,
  isPerimeterWallCell,
} from '../../domain/floor/starter-map.ts';
import { walkBlockedCells } from '../../canvas/world/blocked-cells.ts';

describe('walkBlockedCells', () => {
  it('blocks west and east perimeter walls so actors cannot path onto them', () => {
    const map = createStarterMap();
    const { w, h } = map.gridSize;
    const blocked = walkBlockedCells(map.placements, w, h);

    expect(blocked.has('0,3')).toBe(true); // west wall
    expect(blocked.has(`${w - 1},3`)).toBe(true); // east wall
    expect(blocked.has('3,0')).toBe(true); // north wall

    const door = doorForGrid(w, h);
    expect(blocked.has(`${door.x},${door.y}`)).toBe(false); // door stays walkable

    // Interior floor remains open.
    expect(blocked.has('3,3')).toBe(false);

    const fromWestInterior = { x: 1, y: 3 };
    const intoWestWall = { x: 0, y: 3 };
    expect(isPerimeterWallCell(intoWestWall.x, intoWestWall.y, w, h)).toBe(true);
    expect(
      findPath({ w, h, blocked }, fromWestInterior, intoWestWall),
    ).toBeNull();

    const fromEastInterior = { x: w - 2, y: 3 };
    const intoEastWall = { x: w - 1, y: 3 };
    expect(
      findPath({ w, h, blocked }, fromEastInterior, intoEastWall),
    ).toBeNull();
  });

  it('still blocks furniture cells and allows door entry paths', () => {
    const map = createStarterMap();
    const { w, h } = map.gridSize;
    const blocked = walkBlockedCells(map.placements, w, h);
    const door = doorForGrid(w, h);
    const wait = { x: door.x, y: door.y - 1 };

    expect(blocked.has('2,2')).toBe(true); // starter table
    const enter = findPath({ w, h, blocked }, door, wait);
    expect(enter).not.toBeNull();
    expect(enter![0]).toEqual(door);
    expect(enter![enter!.length - 1]).toEqual(wait);
  });

  it('blocks chair seat cells so the player cannot walk through them', () => {
    const map = createStarterMap();
    const { w, h } = map.gridSize;
    const blocked = walkBlockedCells(map.placements, w, h);
    // Starter 2-top at (2,2) has seats at (1,2) and (3,2).
    expect(blocked.has('1,2')).toBe(true);
    expect(blocked.has('3,2')).toBe(true);
    expect(
      findPath({ w, h, blocked }, { x: 1, y: 3 }, { x: 1, y: 2 }),
    ).toBeNull();
    // Guests may still path onto their seat.
    expect(
      findPath(
        { w, h, blocked },
        { x: 1, y: 3 },
        { x: 1, y: 2 },
        { allowBlockedEndpoints: true },
      ),
    ).not.toBeNull();
  });
});
