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

/** Starter full-room map: dining left, kitchen right, door on south edge. */
export function createStarterMap(): StarterMap {
  const gridSize = { w: 10, h: 8 };
  const dining = rect(0, 0, 6, 8);
  const kitchen = rect(6, 0, 4, 8);
  return {
    gridSize,
    zones: {
      dining,
      kitchen,
      door: { ...STARTER_DOOR },
    },
    placements: [
      { id: 'table_1', itemKey: 'table_2seat', x: 1, y: 2, rotation: 0 },
      { id: 'table_2', itemKey: 'table_2seat', x: 3, y: 2, rotation: 0 },
      { id: 'station_prep', itemKey: 'prep_station', x: 7, y: 2, rotation: 0 },
    ],
  };
}

export function isDiningCell(zones: MapZones, x: number, y: number): boolean {
  return zones.dining.some((c) => c.x === x && c.y === y);
}

export function isKitchenCell(zones: MapZones, x: number, y: number): boolean {
  return zones.kitchen.some((c) => c.x === x && c.y === y);
}
