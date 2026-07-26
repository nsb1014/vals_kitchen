import type { Placement } from '../state/game-state.ts';

/** South-edge door cell for the starter map (matches createStarterMap zones.door). */
export const STARTER_DOOR = { x: 3, y: 7 } as const;

export interface MapZones {
  dining: { x: number; y: number }[];
  kitchen: { x: number; y: number }[];
  door: { x: number; y: number };
}

export interface StarterMap {
  gridSize: { w: number; h: number };
  zones: MapZones;
  placements: Placement[];
}

function rect(x0: number, y0: number, w: number, h: number): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * Perimeter wall cells match GridLayer (x/y == 0 or max). Interior walkable
 * dining for side seats needs table.x in [2, diningMaxX-1] so x±1 stays off walls.
 */
export function isPerimeterWallCell(
  x: number,
  y: number,
  gridW: number,
  gridH: number,
): boolean {
  return x === 0 || y === 0 || x === gridW - 1 || y === gridH - 1;
}

/** Cardinal edge for a perimeter cell. Corners prefer N/S so horizontal runs stay consistent. */
export type PerimeterWallEdge = 'n' | 'e' | 's' | 'w';

export function perimeterWallEdge(
  x: number,
  y: number,
  gridW: number,
  gridH: number,
): PerimeterWallEdge | null {
  if (!isPerimeterWallCell(x, y, gridW, gridH)) return null;
  if (y === 0) return 'n';
  if (y === gridH - 1) return 's';
  if (x === 0) return 'w';
  return 'e';
}

/** Starter full-room map: dining left, kitchen right, door on south edge. */
export function createStarterMap(): StarterMap {
  const gridSize = { w: 10, h: 8 };
  // Dining is 7 cols so two W–table–E blocks fit on interior tiles (x=1..6).
  const dining = rect(0, 0, 7, 8);
  const kitchen = rect(7, 0, 3, 8);
  return {
    gridSize,
    zones: {
      dining,
      kitchen,
      door: { ...STARTER_DOOR },
    },
    placements: [
      // Inset from west wall: seats at x±1 must not land on perimeter wall cells.
      { id: 'table_1', itemKey: 'table_2seat', x: 2, y: 2, rotation: 0 },
      { id: 'table_2', itemKey: 'table_2seat', x: 5, y: 2, rotation: 0 },
      { id: 'station_prep', itemKey: 'prep_station', x: 8, y: 2, rotation: 0 },
    ],
  };
}

export function isDiningCell(zones: MapZones, x: number, y: number): boolean {
  return zones.dining.some((c) => c.x === x && c.y === y);
}

export function isKitchenCell(zones: MapZones, x: number, y: number): boolean {
  return zones.kitchen.some((c) => c.x === x && c.y === y);
}
