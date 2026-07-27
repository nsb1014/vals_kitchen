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
  // Clearing removes dirty dishes/place settings → bare table (unset art).
  // Next party must set the table again before seating.
  return transition(table, 'dirty', 'unset');
}

export function occupyTable(table: FloorTable): FloorTable {
  return transition(table, 'ready', 'occupied');
}

export function markDirty(table: FloorTable): FloorTable {
  return transition(table, 'occupied', 'dirty');
}
