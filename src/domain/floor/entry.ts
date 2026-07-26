import type { FloorDay, FloorGuest } from './types.ts';

const ENTRY_PIPELINE: ReadonlySet<FloorGuest['stage']> = new Set(['entering', 'waiting']);

/** True while a guest is walking in or standing ready to seat at the entrance. */
export function waitingAreaOccupied(day: FloorDay): boolean {
  return day.pool.some((g) => ENTRY_PIPELINE.has(g.stage));
}

export function entryPipelineGuest(day: FloorDay): FloorGuest | undefined {
  return day.pool.find((g) => ENTRY_PIPELINE.has(g.stage));
}
