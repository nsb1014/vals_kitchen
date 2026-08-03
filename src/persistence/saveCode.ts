import LZString from 'lz-string';
import { decorPurchasedCountsFromPlacements } from '../domain/economy/decor.ts';
import type { GameState } from '../domain/state/game-state.ts';
import { CURRENT_SAVE_VERSION, normalizeGameState } from '../domain/state/game-state.ts';
import {
  SAVE_CODE_PREFIX,
  type SaveEnvelope,
  computeChecksum,
  computeSnapshotChecksum,
  createEnvelope,
  validateEnvelope,
} from './serialize.ts';
import {
  createEmptyPresentationCheckpoint,
  normalizePresentationCheckpoint,
  type GameSaveSnapshot,
  type PresentationCheckpoint,
} from './presentation-checkpoint.ts';

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

function encodeEnvelope(envelope: SaveEnvelope): string {
  const compressed = LZString.compressToUint8Array(JSON.stringify(envelope));
  if (!compressed) {
    throw new Error('Failed to compress save data');
  }
  return `${SAVE_CODE_PREFIX}.${uint8ToBase64Url(compressed)}`;
}

export function exportSaveCode(
  state: GameState,
  createdAt?: string,
  presentation: PresentationCheckpoint = createEmptyPresentationCheckpoint(),
): string {
  return encodeEnvelope(createEnvelope(state, createdAt, presentation));
}

export function exportSaveCodeSnapshot(
  snapshot: GameSaveSnapshot,
  createdAt?: string,
): string {
  return encodeEnvelope(
    createEnvelope(snapshot.state, createdAt, snapshot.presentation),
  );
}

export const exportSaveSnapshotCode = exportSaveCodeSnapshot;

function decodeSaveCode(code: string): SaveEnvelope {
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
  return envelope;
}

export function parseSaveCodeSnapshot(code: string): GameSaveSnapshot {
  const envelope = decodeSaveCode(code);
  const state = normalizeGameState(envelope.gameState);
  return {
    state,
    presentation: normalizePresentationCheckpoint(envelope.presentation, state),
  };
}

export function parseSaveCode(code: string): GameState {
  return parseSaveCodeSnapshot(code).state;
}

export function migrateSave(raw: unknown): SaveEnvelope {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid save: not an object');
  }

  const record = raw as Record<string, unknown>;
  let version = typeof record.saveVersion === 'number' ? record.saveVersion : 0;
  const originalVersion = version;

  if (version > CURRENT_SAVE_VERSION) {
    throw new Error(`Save version ${version} is newer than supported version ${CURRENT_SAVE_VERSION}`);
  }

  if (version === 0) {
    throw new Error('Invalid save: missing saveVersion');
  }
  if (!record.gameState || typeof record.gameState !== 'object') {
    throw new Error('Invalid save: missing gameState');
  }
  const originalChecksum =
    typeof record.checksum === 'string' ? record.checksum : '';
  if (originalVersion === CURRENT_SAVE_VERSION && !originalChecksum) {
    throw new Error('Save checksum mismatch');
  }
  const originalExpectedChecksum =
    originalVersion >= 7
      ? computeSnapshotChecksum(
          record.gameState as GameState,
          record.presentation as PresentationCheckpoint,
        )
      : computeChecksum(record.gameState as GameState);
  if (originalChecksum && originalChecksum !== originalExpectedChecksum) {
    throw new Error('Save checksum mismatch');
  }
  if (originalVersion >= 7) {
    normalizePresentationCheckpoint(
      record.presentation,
      record.gameState as GameState,
    );
  }

  type MigratingEnvelope = {
    saveVersion: number;
    checksum: string;
    createdAt: string;
    gameState: Record<string, unknown> & Partial<GameState>;
    presentation?: unknown;
  };

  let envelope = raw as MigratingEnvelope;

  if (version === 1) {
    envelope = {
      ...envelope,
      saveVersion: 2,
      gameState: {
        ...envelope.gameState,
        recipeMastery: (envelope.gameState.recipeMastery as GameState['recipeMastery']) ?? {},
      },
    };
    version = 2;
  }

  if (version === 2) {
    // Width-annex → separate back-kitchen room; normalizeGameState reclaims columns
    // when backKitchenPlacements is absent on the gameState.
    const nextState = { ...envelope.gameState };
    delete nextState.backKitchenPlacements;
    envelope = {
      ...envelope,
      saveVersion: 3,
      gameState: nextState,
    };
    version = 3;
  }

  if (version === 3) {
    const placements = Array.isArray(envelope.gameState.placements)
      ? envelope.gameState.placements.filter(
          (placement): placement is GameState['placements'][number] =>
            Boolean(
              placement &&
                typeof placement === 'object' &&
                typeof (placement as { itemKey?: unknown }).itemKey === 'string',
            ),
        )
      : [];
    envelope = {
      ...envelope,
      saveVersion: 4,
      gameState: {
        ...envelope.gameState,
        decorPurchasedCounts: decorPurchasedCountsFromPlacements(placements),
      },
    };
    version = 4;
  }

  if (version === 4) {
    envelope = {
      ...envelope,
      saveVersion: 5,
      gameState: {
        ...envelope.gameState,
        unlockedAchievementIds: envelope.gameState.unlockedAchievementIds ?? [],
      },
    };
    version = 5;
  }

  if (version === 5) {
    const activeDay = envelope.gameState.activeDay;
    envelope = {
      ...envelope,
      saveVersion: 6,
      gameState: {
        ...envelope.gameState,
        activeDay:
          activeDay && typeof activeDay === 'object'
            ? {
                ...activeDay,
                serviceStarted:
                  (activeDay as { serviceStarted?: unknown }).serviceStarted === false
                    ? false
                    : true,
              }
            : activeDay,
      },
    };
    version = 6;
  }

  if (version === 6) {
    envelope = {
      ...envelope,
      saveVersion: 7,
      gameState: {
        ...envelope.gameState,
        saveVersion: 7,
      },
      presentation: createEmptyPresentationCheckpoint(),
    };
  }

  const gameState = {
    ...envelope.gameState,
    saveVersion: CURRENT_SAVE_VERSION,
  } as GameState;
  const presentation = normalizePresentationCheckpoint(
    envelope.presentation,
    gameState,
  );
  return {
    ...envelope,
    saveVersion: CURRENT_SAVE_VERSION,
    checksum: computeSnapshotChecksum(gameState, presentation),
    createdAt: String(envelope.createdAt ?? ''),
    gameState,
    presentation,
  };
}
