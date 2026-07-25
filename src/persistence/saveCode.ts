import LZString from 'lz-string';
import type { GameState } from '../domain/state/game-state.ts';
import { CURRENT_SAVE_VERSION, normalizeGameState } from '../domain/state/game-state.ts';
import {
  SAVE_CODE_PREFIX,
  type SaveEnvelope,
  createEnvelope,
  validateEnvelope,
} from './serialize.ts';

function uint8ToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToUint8(payload: string): Uint8Array {
  const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLength);
  const binary =
    typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function exportSaveCode(state: GameState, createdAt?: string): string {
  const envelope = createEnvelope(state, createdAt);
  const compressed = LZString.compressToUint8Array(JSON.stringify(envelope));
  if (!compressed) {
    throw new Error('Failed to compress save data');
  }
  return `${SAVE_CODE_PREFIX}.${uint8ToBase64Url(compressed)}`;
}

export function parseSaveCode(code: string): GameState {
  const trimmed = code.trim();
  if (!trimmed.startsWith(`${SAVE_CODE_PREFIX}.`)) {
    throw new Error('Invalid Save Code: must start with RS1.');
  }

  const payload = trimmed.slice(SAVE_CODE_PREFIX.length + 1);
  if (!payload) {
    throw new Error('Invalid Save Code: missing payload');
  }

  let decompressed: string | null;
  try {
    decompressed = LZString.decompressFromUint8Array(base64UrlToUint8(payload));
  } catch {
    throw new Error('Invalid Save Code: corrupted compression payload');
  }

  if (!decompressed) {
    throw new Error('Invalid Save Code: unable to decompress payload');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decompressed);
  } catch {
    throw new Error('Invalid Save Code: malformed JSON');
  }

  const envelope = migrateSave(parsed) as SaveEnvelope;
  validateEnvelope(envelope);
  return normalizeGameState(envelope.gameState);
}

export function migrateSave(raw: unknown): SaveEnvelope {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid save: not an object');
  }

  const record = raw as Record<string, unknown>;
  const version = typeof record.saveVersion === 'number' ? record.saveVersion : 0;

  if (version > CURRENT_SAVE_VERSION) {
    throw new Error(`Save version ${version} is newer than supported version ${CURRENT_SAVE_VERSION}`);
  }

  if (version === 0) {
    throw new Error('Invalid save: missing saveVersion');
  }

  return raw as SaveEnvelope;
}
