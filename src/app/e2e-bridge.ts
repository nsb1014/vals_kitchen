import {
  computeCameraCenter,
  gridToWorld,
  worldToScreen,
} from '../canvas/coordinates.ts';
import { findBestMatchCombo } from '../domain/day/customer-request-generator.ts';
import { isDayComplete } from '../domain/day/serve.ts';
import type { GameAction } from '../domain/reducer.ts';
import { exportSaveCode as encodeSaveCode } from '../persistence/saveCode.ts';
import { getGameStateSnapshot, useGameStore } from '../store/game-store.ts';
import {
  getDomainContext,
  isRecipesContentReady,
  isScoringContentReady,
} from './content-loader.ts';
import type { RestaurantApp } from '../canvas/RestaurantApp.ts';

export interface E2eBridge {
  getPlacements: () => Array<{
    id: string;
    itemKey: string;
    x: number;
    y: number;
  }>;
  getState: () => {
    day: number;
    cash: number;
    rating: number;
    hydrated: boolean;
    activeDay: { queueIndex: number; customerCount: number } | null;
    composeDraftIngredientIds: string[];
    composeSheetOpen: boolean;
    screen: string;
    floorPlayerGrid: { x: number; y: number } | null;
  };
  getGameState: () => ReturnType<typeof getGameStateSnapshot>;
  isScoringReady: () => boolean;
  isRecipesReady: () => boolean;
  gridCellToScreen: (gx: number, gy: number) => { x: number; y: number };
  exportSaveCode: () => string;
  /** Drive one step of the floor service loop (for e2e smoke). */
  advanceFloorServiceOnce: () => Promise<
    'pending_review' | 'day_complete' | 'advanced' | 'idle'
  >;
  /** Run the full floor day to summary (dismisses reviews, closes day). */
  completeFloorServiceDay: () => Promise<void>;
  dispatch: (action: GameAction) => Promise<void>;
  setFloorNavPosition: (pos: { x: number; y: number }) => void;
  dismissPendingReview: () => void;
  prepareCookUiFixture: () => Promise<void>;
  openComposeSheet: () => void;
}

declare global {
  interface Window {
    __E2E__?: E2eBridge;
  }
}

/** Hooks for Playwright when `?e2e=1` is present. */
export function installE2eBridge(
  getRestaurantApp: () => RestaurantApp | null,
): void {
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
        composeSheetOpen: s.composeSheetOpen,
        screen: s.screen,
        floorPlayerGrid: s.floorPlayerGrid,
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

    async dispatch(action) {
      await useGameStore.getState().dispatch(action);
    },

    setFloorNavPosition(pos) {
      getRestaurantApp()?.nav.snapTo(pos);
      useGameStore.getState().setFloorNavPosition(pos);
    },

    dismissPendingReview() {
      useGameStore.getState().dismissPendingReview();
    },

    async prepareCookUiFixture() {
      if (!useGameStore.getState().activeDay) {
        await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
      }
      useGameStore.getState().dismissModifier();

      const floor = useGameStore.getState().activeDay!.floor!;
      for (const table of floor.tables) {
        if (table.state === 'unset') {
          await useGameStore.getState().dispatch({
            type: 'FLOOR_SET_TABLE',
            placementId: table.placementId,
          });
        }
      }
      if (
        useGameStore
          .getState()
          .activeDay!.floor!.pool.some((guest) => guest.stage === 'entering')
      ) {
        await useGameStore
          .getState()
          .dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
      }
      if (
        useGameStore
          .getState()
          .activeDay!.floor!.pool.some((guest) => guest.stage === 'waiting')
      ) {
        await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
      }
      const customerIds = useGameStore
        .getState()
        .activeDay!.floor!.pool.filter((guest) => guest.stage === 'seated')
        .map((guest) => guest.customer.id);
      if (customerIds.length > 0) {
        await useGameStore.getState().dispatch({
          type: 'FLOOR_TAKE_ORDERS',
          customerIds,
        });
      }

      const current = useGameStore.getState();
      const station = current.placements.find(
        (placement) => placement.itemKey === 'prep_station',
      );
      const openTicket = current.activeDay!.floor!.tickets.find(
        (ticket) => ticket.status === 'open',
      );
      if (!station || !openTicket) {
        throw new Error(
          'cook UI fixture could not create a station and open ticket',
        );
      }
      useGameStore.setState({
        unlockedIngredientIds: getDomainContext().ingredients.map(
          (ingredient) => ingredient.id,
        ),
      });
      useGameStore.getState().setFloorSelectedTicket(openTicket.id);
      const cookPosition = { x: station.x - 1, y: station.y };
      const restaurantApp = getRestaurantApp();
      restaurantApp?.app.stop();
      restaurantApp?.nav.snapTo(cookPosition);
      useGameStore.getState().setFloorNavPosition(cookPosition);
    },

    openComposeSheet() {
      useGameStore.getState().openComposeSheet();
    },

    async advanceFloorServiceOnce() {
      const store = useGameStore.getState();
      if (store.pendingReview) return 'pending_review';
      if (!store.activeDay?.floor) {
        return isDayComplete(store) ? 'day_complete' : 'idle';
      }
      if (isDayComplete(store)) return 'day_complete';

      const ctx = getDomainContext();
      const dispatch = (action: GameAction) =>
        useGameStore.getState().dispatch(action);

      const floor = () => useGameStore.getState().activeDay!.floor!;

      for (const table of [...floor().tables]) {
        if (table.state === 'unset') {
          await dispatch({
            type: 'FLOOR_SET_TABLE',
            placementId: table.placementId,
          });
        }
      }
      for (const table of [...floor().tables]) {
        if (table.state === 'dirty') {
          await dispatch({
            type: 'FLOOR_CLEAR_TABLE',
            placementId: table.placementId,
          });
        }
      }

      if (floor().pool.some((g) => g.stage === 'entering')) {
        await dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
      }

      if (floor().pool.some((g) => g.stage === 'waiting')) {
        await dispatch({ type: 'FLOOR_SEAT_NEXT' });
      }

      const toOrder = floor()
        .pool.filter((g) => g.stage === 'seated')
        .map((g) => g.customer.id);
      if (toOrder.length > 0) {
        await dispatch({ type: 'FLOOR_TAKE_ORDERS', customerIds: toOrder });
      }

      if (useGameStore.getState().pendingReview) return 'pending_review';

      const open = floor().tickets.find((t) => t.status === 'open');
      if (open && !floor().carriedTicketId) {
        const guest = floor().pool.find(
          (g) => g.customer.id === open.customerId,
        );
        if (guest) {
          const unlocked = useGameStore.getState().unlockedIngredientIds;
          const combo = findBestMatchCombo(
            unlocked,
            guest.customer.preference,
            ctx.ingredientsById,
            ctx.compoundAffinity,
          );
          await dispatch({
            type: 'FLOOR_PLATE',
            ticketId: open.id,
            ingredientIds: combo.ingredientIds,
          });
          await dispatch({ type: 'FLOOR_DELIVER', ticketId: open.id });
        }
      }

      if (useGameStore.getState().pendingReview) return 'pending_review';

      if (
        floor().pool.some((g) => g.stage === 'eating' || g.stage === 'leaving')
      ) {
        await dispatch({ type: 'FLOOR_TICK_EATING' });
      }

      if (isDayComplete(useGameStore.getState())) return 'day_complete';
      return 'advanced';
    },

    async completeFloorServiceDay() {
      for (let guard = 0; guard < 500; guard += 1) {
        const state = useGameStore.getState();
        if (state.daySummary) return;

        if (state.pendingReview) {
          if (isDayComplete(state)) {
            await state.dispatch({ type: 'CLOSE_DAY' });
          } else {
            state.dismissPendingReview();
          }
          continue;
        }

        if (state.activeDay && isDayComplete(state)) {
          await state.dispatch({ type: 'CLOSE_DAY' });
          continue;
        }

        const step = await window.__E2E__!.advanceFloorServiceOnce();
        if (step === 'idle') {
          throw new Error('floor service stalled (idle)');
        }
      }
      throw new Error('floor service day did not complete within guard limit');
    },
  };
}
