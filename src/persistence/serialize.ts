import type { GameState } from '../domain/state/game-state.ts';
import { CURRENT_SAVE_VERSION } from '../domain/state/game-state.ts';

export interface SaveEnvelope {
  saveVersion: typeof CURRENT_SAVE_VERSION;
  checksum: string;
  createdAt: string;
  gameState: GameState;
}

export const SAVE_KEY = 'restaurant-save';
export const BACKUP_KEY = 'restaurant-save-backup';
export const SAVE_CODE_PREFIX = 'RS1';

export function canonicalize(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .filter((key) => obj[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`)
    .join(',')}}`;
}

export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeChecksum(state: GameState): string {
  return fnv1aHex(canonicalize(state));
}

export function createEnvelope(state: GameState, createdAt = new Date().toISOString()): SaveEnvelope {
  return {
    saveVersion: CURRENT_SAVE_VERSION,
    checksum: computeChecksum(state),
    createdAt,
    gameState: structuredClone(state),
  };
}

export function validateEnvelope(envelope: SaveEnvelope): void {
  if (envelope.saveVersion !== CURRENT_SAVE_VERSION) {
    throw new Error(`Unsupported save version: ${envelope.saveVersion}`);
  }
  const expected = computeChecksum(envelope.gameState);
  if (envelope.checksum !== expected) {
    throw new Error('Save checksum mismatch');
  }
}
