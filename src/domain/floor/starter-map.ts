import type { Placement } from '../state/game-state.ts';

/** South-edge guest door cell for the starter map (matches createStarterMap zones.door). */
export const STARTER_DOOR = { x: 3, y: 7 } as const;

/** Kitchen depth in columns on the main dining+kitchen floor; dining occupies the rest. */
export const STARTER_KITCHEN_WIDTH = 3;

/** Which screen of the floor the player is viewing. */
export type FloorRoomId = 'main' | 'back_kitchen';

export interface MapZoneOptions {
  /**
   * Which room’s zones to compute. Main keeps dining + east kitchen;
   * back kitchen is a same-size all-kitchen room (annex unlock).
   */
  room?: FloorRoomId;
}

export interface MapZones {
  dining: { x: number; y: number }[];
  kitchen: { x: number; y: number }[];
  /** Guest entrance on main; connecting door on back kitchen. */
  door: { x: number; y: number };
}

export interface GridCell {
  x: number;
  y: number;
}

/** Clear interior lane shared by arriving and departing guests at the main door. */
export function guestDoorwayLane(door: GridCell): GridCell {
  return { x: door.x, y: Math.max(0, door.y - 1) };
}

/**
 * Single waiting alcove beside the main entrance. Prefer west so the guest is
 * outside the doorway lane; narrow layouts whose lane is already at x=1 use
 * the east cell instead of the west perimeter wall.
 */
export function guestWaitingAlcove(door: GridCell): GridCell {
  const lane = guestDoorwayLane(door);
  return { x: lane.x > 1 ? lane.x - 1 : lane.x + 1, y: lane.y };
}

/** Door, shared doorway lane, and waiting alcove kept free on the main floor. */
export function mainGuestEntranceReservedCells(
  gridW: number,
  gridH: number,
): GridCell[] {
  const door = doorForGrid(gridW, gridH);
  return [door, guestDoorwayLane(door), guestWaitingAlcove(door)];
}

/** Eastmost kitchen column count on the main floor (fixed; annex is a separate room). */
export function kitchenWidthForGrid(_opts: MapZoneOptions = {}): number {
  return STARTER_KITCHEN_WIDTH;
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

/** Mid-height east-wall connecting door on the main floor (into the back kitchen). */
export function connectingDoorForMain(gridW: number, gridH: number): { x: number; y: number } {
  return { x: gridW - 1, y: Math.floor(gridH / 2) };
}

/** Mid-height west-wall connecting door on the back-kitchen floor (back to main). */
export function connectingDoorForBackKitchen(
  gridW: number,
  gridH: number,
): { x: number; y: number } {
  void gridW;
  return { x: 0, y: Math.floor(gridH / 2) };
}

/** Connecting door cell for the given room, or null when the annex is locked. */
export function connectingDoorForRoom(
  room: FloorRoomId,
  gridW: number,
  gridH: number,
  kitchenAnnexOwned: boolean,
): { x: number; y: number } | null {
  if (!kitchenAnnexOwned) return null;
  return room === 'main'
    ? connectingDoorForMain(gridW, gridH)
    : connectingDoorForBackKitchen(gridW, gridH);
}

/**
 * Walkable door cells for the active room.
 * Main: guest south door + (when unlocked) east connecting door.
 * Back kitchen: west connecting door only.
 */
export function openDoorCellsForRoom(
  room: FloorRoomId,
  gridW: number,
  gridH: number,
  kitchenAnnexOwned: boolean,
): { x: number; y: number }[] {
  if (room === 'back_kitchen') {
    const door = connectingDoorForBackKitchen(gridW, gridH);
    return kitchenAnnexOwned ? [door] : [];
  }
  const doors = [doorForGrid(gridW, gridH)];
  if (kitchenAnnexOwned) {
    doors.push(connectingDoorForMain(gridW, gridH));
  }
  return doors;
}

/** Interior cell just inside a connecting door (spawn / transfer target preference). */
export function connectingDoorInterior(
  room: FloorRoomId,
  gridW: number,
  gridH: number,
): { x: number; y: number } {
  const door =
    room === 'main'
      ? connectingDoorForMain(gridW, gridH)
      : connectingDoorForBackKitchen(gridW, gridH);
  if (room === 'main') {
    return { x: Math.max(1, door.x - 1), y: door.y };
  }
  return { x: Math.min(gridW - 2, door.x + 1), y: door.y };
}

/**
 * Cook spawn for a new service day: one tile north and one tile east of the
 * waiting line. The horizontal lane separation keeps two full-height chibi
 * silhouettes from overlapping at the south door.
 */
export function servicePlayerSpawn(
  gridW: number,
  gridH: number,
): { x: number; y: number } {
  const door = doorForGrid(gridW, gridH);
  const waitY = Math.max(0, door.y - 1);
  return {
    x: Math.min(gridW - 2, door.x + 1),
    y: Math.max(1, waitY - 1),
  };
}

/**
 * Dining / kitchen / door for any grid size.
 * Main: kitchen is the eastmost STARTER_KITCHEN_WIDTH columns; dining is the rest;
 * guest door sits on the south perimeter, centered in the dining wing.
 * Back kitchen: entire map is kitchen; door is the west connecting door.
 */
export function mapZonesForGrid(
  gridW: number,
  gridH: number,
  opts: MapZoneOptions = {},
): MapZones {
  const room = opts.room ?? 'main';
  if (room === 'back_kitchen') {
    return {
      dining: [],
      kitchen: rect(0, 0, gridW, gridH),
      door: connectingDoorForBackKitchen(gridW, gridH),
    };
  }

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

export function otherFloorRoom(room: FloorRoomId): FloorRoomId {
  return room === 'main' ? 'back_kitchen' : 'main';
}
