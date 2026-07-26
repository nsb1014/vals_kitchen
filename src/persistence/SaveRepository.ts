import { get, set, del } from 'idb-keyval';
import type { GameState } from '../domain/state/game-state.ts';
import { normalizeGameState } from '../domain/state/game-state.ts';
import {
  BACKUP_KEY,
  SAVE_KEY,
  createEnvelope,
  validateEnvelope,
  type SaveEnvelope,
} from './serialize.ts';
import { exportSaveCode, migrateSave, parseSaveCode } from './saveCode.ts';

export type StorageAdapter = {
  get: <T>(key: string) => Promise<T | undefined>;
  set: (key: string, value: unknown) => Promise<void>;
  del: (key: string) => Promise<void>;
};

export interface LoadResult {
  state: GameState | null;
  source: 'primary' | 'backup' | 'none';
  error?: string;
}

export interface SaveRepository {
  load(): Promise<LoadResult>;
  save(state: GameState): Promise<void>;
  clear(): Promise<void>;
  exportSaveCode(state: GameState): string;
  importSaveCode(code: string): GameState;
}

function rawLooksLikeEnvelope(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.saveVersion === 'number' && 'gameState' in record;
}

function createReadEnvelope(storage: StorageAdapter) {
  return async function readEnvelope(key: string): Promise<SaveEnvelope | null> {
    const raw = await storage.get<unknown>(key);
    if (!raw) return null;
    if (!rawLooksLikeEnvelope(raw)) {
      throw new Error(`Corrupt save at ${key}`);
    }
    const migrated = migrateSave(raw);
    validateEnvelope(migrated);
    return migrated;
  };
}

const defaultStorage: StorageAdapter = {
  get: async <T>(key: string) => get<T>(key),
  set: async (key: string, value: unknown) => {
    await set(key, value);
  },
  del: async (key: string) => {
    await del(key);
  },
};

export function createSaveRepository(storage: StorageAdapter = defaultStorage): SaveRepository {
  const readEnvelope = createReadEnvelope(storage);

  return {
    async load(): Promise<LoadResult> {
      try {
        const primary = await readEnvelope(SAVE_KEY);
        if (primary) {
          return { state: normalizeGameState(primary.gameState), source: 'primary' };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try {
          const backup = await readEnvelope(BACKUP_KEY);
          if (backup) {
            return { state: normalizeGameState(backup.gameState), source: 'backup', error: message };
          }
        } catch (backupError) {
          return {
            state: null,
            source: 'none',
            error: backupError instanceof Error ? backupError.message : String(backupError),
          };
        }
        return { state: null, source: 'none', error: message };
      }

      try {
        const backup = await readEnvelope(BACKUP_KEY);
        if (backup) {
          return { state: normalizeGameState(backup.gameState), source: 'backup' };
        }
      } catch (error) {
        return {
          state: null,
          source: 'none',
          error: error instanceof Error ? error.message : String(error),
        };
      }

      return { state: null, source: 'none' };
    },

    async save(state: GameState): Promise<void> {
      const envelope = createEnvelope(state);
      try {
        const existing = await storage.get<unknown>(SAVE_KEY);
        if (existing) {
          await storage.set(BACKUP_KEY, existing);
        }
      } catch {
        // backup write is best-effort
      }
      await storage.set(SAVE_KEY, envelope);
    },

    async clear(): Promise<void> {
      await storage.del(SAVE_KEY);
      await storage.del(BACKUP_KEY);
    },

    exportSaveCode(state: GameState): string {
      return exportSaveCode(state);
    },

    importSaveCode(code: string): GameState {
      return parseSaveCode(code);
    },
  };
}

export const defaultSaveRepository = createSaveRepository();

export interface PersistStorageResult {
  supported: boolean;
  granted: boolean;
}

export async function requestPersistentStorage(): Promise<PersistStorageResult> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return { supported: false, granted: false };
  }
  try {
    const granted = await navigator.storage.persist();
    return { supported: true, granted };
  } catch {
    return { supported: true, granted: false };
  }
}
