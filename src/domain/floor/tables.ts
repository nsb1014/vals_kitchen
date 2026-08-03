import type { FloorTable } from './types.ts';

function transition(table: FloorTable, from: FloorTable['state'], to: FloorTable['state']): FloorTable {
  if (table.state !== from) {
    throw new Error(`Illegal table transition: ${table.state} → ${to}`);
  }
  return { ...table, state: to };
}

export function setTable(table: FloorTable): FloorTable {
  return transition(table, 'unset', 'ready');
}

export function clearTable(table: FloorTable): FloorTable {
  // Clearing removes the previous party's dishes while leaving the table
  // prepared for the next guest. `unset` is reserved for morning setup (and
  // legacy saves that still need to finish that setup).
  return transition(table, 'dirty', 'ready');
}

export function occupyTable(table: FloorTable): FloorTable {
  return transition(table, 'ready', 'occupied');
}

export function markDirty(table: FloorTable): FloorTable {
  return transition(table, 'occupied', 'dirty');
}
