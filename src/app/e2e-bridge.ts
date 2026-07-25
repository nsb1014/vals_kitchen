import { computeCameraCenter, gridToWorld, worldToScreen } from '../canvas/coordinates.ts';
import { exportSaveCode as encodeSaveCode } from '../persistence/saveCode.ts';
import { getGameStateSnapshot, useGameStore } from '../store/game-store.ts';
import {
  isRecipesContentReady,
  isScoringContentReady,
} from './content-loader.ts';

export interface E2eBridge {
  getPlacements: () => Array<{ id: string; itemKey: string; x: number; y: number }>;
  getState: () => {
    day: number;
    cash: number;
    rating: number;
    hydrated: boolean;
    activeDay: { queueIndex: number; customerCount: number } | null;
    composeDraftIngredientIds: string[];
    screen: string;
  };
  getGameState: () => ReturnType<typeof getGameStateSnapshot>;
  isScoringReady: () => boolean;
  isRecipesReady: () => boolean;
  gridCellToScreen: (gx: number, gy: number) => { x: number; y: number };
  exportSaveCode: () => string;
}

declare global {
  interface Window {
    __E2E__?: E2eBridge;
  }
}

/** Read-only hooks for Playwright when `?e2e=1` is present. */
export function installE2eBridge(): void {
  if (typeof window === 'undefined') return;
  if (!new URLSearchParams(window.location.search).has('e2e')) return;

  window.__E2E__ = {
    getPlacements() {
      return useGameStore.getState().placements.map((p) => ({
        id: p.id,
        itemKey: p.itemKey,
        x: p.x,
        y: p.y,
      }));
    },

    getState() {
      const s = useGameStore.getState();
      return {
        day: s.day,
        cash: s.cash,
        rating: s.rating,
        hydrated: s.hydrated,
        activeDay: s.activeDay
          ? {
              queueIndex: s.activeDay.queueIndex,
              customerCount: s.activeDay.customers.length,
            }
          : null,
        composeDraftIngredientIds: s.composeDraftIngredientIds ?? [],
        screen: s.screen,
      };
    },

    getGameState: () => getGameStateSnapshot(),

    isScoringReady: () => isScoringContentReady(),

    isRecipesReady: () => isRecipesContentReady(),

    gridCellToScreen(gx: number, gy: number) {
      const canvas = document.querySelector(
        '[data-testid="restaurant-canvas"]',
      ) as HTMLCanvasElement | null;
      if (!canvas) {
        throw new Error('restaurant canvas not mounted');
      }
      const rect = canvas.getBoundingClientRect();
      const state = useGameStore.getState();
      const camera = computeCameraCenter(
        state.gridSize.w,
        state.gridSize.h,
        canvas.clientWidth,
        canvas.clientHeight,
      );
      const world = gridToWorld(gx, gy);
      const screen = worldToScreen(world.x + 8, world.y + 8, camera);
      return { x: rect.left + screen.x, y: rect.top + screen.y };
    },

    exportSaveCode: () => encodeSaveCode(getGameStateSnapshot()),
  };
}
