import type { Placement } from '../../domain/state/game-state.ts';

/** Walk-blocking cells occupied by tables and kitchen stations. */
export function blockedCellsFromPlacements(placements: Placement[]): Set<string> {
  const blocked = new Set<string>();
  for (const p of placements) {
    if (p.itemKey.startsWith('table') || p.itemKey.endsWith('_station')) {
      blocked.add(`${p.x},${p.y}`);
    }
  }
  return blocked;
}
