import type { FloorDay, FloorGuest } from './types.ts';

const ENTRY_PIPELINE: ReadonlySet<FloorGuest['stage']> = new Set([
  'entering',
  'waiting',
  'seating',
]);

/** True while the current arrival is entering, waiting, or walking to their seat. */
export function waitingAreaOccupied(day: FloorDay): boolean {
  return day.pool.some((g) => ENTRY_PIPELINE.has(g.stage));
}

export function entryPipelineGuest(day: FloorDay): FloorGuest | undefined {
  return day.pool.find((g) => ENTRY_PIPELINE.has(g.stage));
}
