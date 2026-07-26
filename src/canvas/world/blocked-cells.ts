import type { Placement } from '../../domain/state/game-state.ts';
import { doorForGrid, isPerimeterWallCell, type MapZoneOptions } from '../../domain/floor/starter-map.ts';
import { EQUIPMENT_IDS } from '../../domain/types.ts';

const EQUIPMENT_ITEM_KEYS = new Set<string>(EQUIPMENT_IDS);

/** Walk-blocking cells occupied by tables and kitchen stations. */
export function blockedCellsFromPlacements(placements: Placement[]): Set<string> {
  const blocked = new Set<string>();
  for (const p of placements) {
    if (p.itemKey.startsWith('table') || EQUIPMENT_ITEM_KEYS.has(p.itemKey)) {
      blocked.add(`${p.x},${p.y}`);
    }
  }
  return blocked;
}

/**
 * Full floor walkability mask: furniture plus perimeter walls.
 * The south door cell stays open so guests can enter/leave.
 */
export function walkBlockedCells(
  placements: Placement[],
  gridW: number,
  gridH: number,
  zoneOpts: MapZoneOptions = {},
): Set<string> {
  const blocked = blockedCellsFromPlacements(placements);
  const door = doorForGrid(gridW, gridH, zoneOpts);
  for (let y = 0; y < gridH; y += 1) {
    for (let x = 0; x < gridW; x += 1) {
      if (!isPerimeterWallCell(x, y, gridW, gridH)) continue;
      if (x === door.x && y === door.y) continue;
      blocked.add(`${x},${y}`);
    }
  }
  return blocked;
}
