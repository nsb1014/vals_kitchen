import type { Placement } from '../state/game-state.ts';

/** South-edge door cell for the starter map (matches createStarterMap zones.door). */
export const STARTER_DOOR = { x: 3, y: 7 } as const;

/** Kitchen depth in columns; dining occupies the rest of the width. */
export const STARTER_KITCHEN_WIDTH = 3;

/**
 * Extra kitchen columns unlocked by the back-kitchen / pantry annex.
 * Doubles interior kitchen depth so all 12 stations stay pathable.
 */
export const KITCHEN_ANNEX_EXTRA_WIDTH = 2;

export interface MapZoneOptions {
  /** When true, kitchen occupies starter width + annex columns. */
  kitchenAnnexOwned?: boolean;
}

export interface MapZones {
  dining: { x: number; y: number }[];
  kitchen: { x: number; y: number }[];
  door: { x: number; y: number };
}

/** Eastmost kitchen column count for the current annex unlock state. */
export function kitchenWidthForGrid(opts: MapZoneOptions = {}): number {
  return STARTER_KITCHEN_WIDTH + (opts.kitchenAnnexOwned ? KITCHEN_ANNEX_EXTRA_WIDTH : 0);
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

/** Atlas frame for a perimeter wall edge (wainscot faces room interior). */
export function wallTileNameForEdge(edge: PerimeterWallEdge): `wall_${PerimeterWallEdge}` {
  return `wall_${edge}`;
}

/**
 * Dining / kitchen / door for any grid size.
 * Kitchen stays the eastmost columns (starter width, or +annex); dining is the rest.
 * Door sits on the south perimeter, centered in the dining wing.
 */
export function mapZonesForGrid(
  gridW: number,
  gridH: number,
  opts: MapZoneOptions = {},
): MapZones {
  const kitchenW = Math.min(kitchenWidthForGrid(opts), Math.max(1, gridW - 2));
  const diningW = Math.max(1, gridW - kitchenW);
  const dining = rect(0, 0, diningW, gridH);
  const kitchen = rect(diningW, 0, kitchenW, gridH);
  const doorX = Math.min(diningW - 1, Math.max(1, Math.floor(diningW / 2)));
  return {
    dining,
    kitchen,
    door: { x: doorX, y: gridH - 1 },
  };
}

/** Starter full-room map: dining left, kitchen right, door on south edge. */
export function createStarterMap(): StarterMap {
  const gridSize = { w: 10, h: 8 };
  const zones = mapZonesForGrid(gridSize.w, gridSize.h);
  return {
    gridSize,
    zones,
    placements: [
      // Inset from west wall: seats at x±1 must not land on perimeter wall cells.
      { id: 'table_1', itemKey: 'table_2seat', x: 2, y: 2, rotation: 0 },
      { id: 'table_2', itemKey: 'table_2seat', x: 5, y: 2, rotation: 0 },
      { id: 'station_prep', itemKey: 'prep_station', x: 8, y: 2, rotation: 0 },
    ],
  };
}

export function doorForGrid(
  gridW: number,
  gridH: number,
  opts: MapZoneOptions = {},
): { x: number; y: number } {
  return mapZonesForGrid(gridW, gridH, opts).door;
}

export function isDiningCell(zones: MapZones, x: number, y: number): boolean {
  return zones.dining.some((c) => c.x === x && c.y === y);
}

export function isKitchenCell(zones: MapZones, x: number, y: number): boolean {
  return zones.kitchen.some((c) => c.x === x && c.y === y);
}
