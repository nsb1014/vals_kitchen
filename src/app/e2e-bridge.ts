import {
  computeCameraCenter,
  gridToWorld,
  worldToScreen,
} from '../canvas/coordinates.ts';
import { findBestMatchCombo } from '../domain/day/customer-request-generator.ts';
import { isDayComplete } from '../domain/day/serve.ts';
import type { GameAction } from '../domain/reducer.ts';
import { exportSaveCode as encodeSaveCode } from '../persistence/saveCode.ts';
import {
  getGameStateSnapshot,
  useGameStore,
  type Celebration,
} from '../store/game-store.ts';
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
  prepareTicketPanelFixture: (
    ticketCount: number,
    carrying?: boolean,
  ) => Promise<void>;
  openComposeSheet: () => void;
  openFlavorInspector: (ingredientId: string) => void;
  /** Debug: live actor sprite sizes after floor sync (Playwright visual QA). */
  getActorSpriteMetrics: () => Array<{
    kind: string;
    tex: string;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
    alpha: number;
    x: number;
    y: number;
    zIndex: number;
  }>;
  setFloorToast: (message: string | null) => void;
  enqueueCelebration: (celebration: Celebration) => void;
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

    getActorSpriteMetrics() {
      const app = getRestaurantApp();
      if (!app) return [];
      const out: Array<{
        kind: string;
        tex: string;
        width: number;
        height: number;
        scaleX: number;
        scaleY: number;
        alpha: number;
        x: number;
        y: number;
        zIndex: number;
      }> = [];
      const visit = (node: { children?: Iterable<unknown> }) => {
        for (const child of node.children ?? []) {
          const c = child as {
            texture?: { height?: number; width?: number; uid?: number };
            width?: number;
            height?: number;
            scale?: { x: number; y: number };
            alpha?: number;
            worldTransform?: { tx: number; ty: number; a: number; d: number };
            x?: number;
            y?: number;
            zIndex?: number;
            children?: Iterable<unknown>;
            visible?: boolean;
          };
          const tex = c.texture;
          if (
            tex &&
            c.visible !== false &&
            typeof c.width === 'number' &&
            typeof c.height === 'number' &&
            c.height > 8
          ) {
            out.push({
              kind: 'sprite',
              tex: `${Math.round(tex.width ?? 0)}x${Math.round(tex.height ?? 0)}`,
              width: Math.round(c.width),
              height: Math.round(c.height),
              scaleX: Number((c.scale?.x ?? 1).toFixed(4)),
              scaleY: Number((c.scale?.y ?? 1).toFixed(4)),
              alpha: c.alpha ?? 1,
              x: Math.round(c.worldTransform?.tx ?? c.x ?? 0),
              y: Math.round(c.worldTransform?.ty ?? c.y ?? 0),
              zIndex: c.zIndex ?? 0,
            });
          }
          if (c.children) visit(c);
        }
      };
      visit(app.depthLayer);
      return out.sort((a, b) => a.y - b.y);
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
        const target = useGameStore
          .getState()
          .activeDay!.floor!.pool.find(
            (guest) => guest.customer.id === customerIds[0],
          );
        if (target?.seat) {
          useGameStore.getState().setFloorNavPosition({ ...target.seat });
        }
        await useGameStore.getState().dispatch({
          type: 'FLOOR_TAKE_ORDERS',
          customerIds: [customerIds[0]!],
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

    async prepareTicketPanelFixture(ticketCount, carrying = false) {
      if (
        !Number.isInteger(ticketCount) ||
        ticketCount < 0 ||
        ticketCount > 4
      ) {
        throw new Error('ticket panel fixture count must be between 0 and 4');
      }
      if (!useGameStore.getState().activeDay) {
        await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
      }
      useGameStore.getState().dismissModifier();

      const activeDay = useGameStore.getState().activeDay!;
      const floor = activeDay.floor!;
      const customers = activeDay.customers.slice(0, ticketCount);
      if (customers.length !== ticketCount) {
        throw new Error('ticket panel fixture does not have enough customers');
      }
      const tickets = customers.map((customer, index) => ({
        id: `ticket_${customer.id}`,
        customerId: customer.id,
        ingredientIds: [],
        status:
          carrying && index === 0 ? ('plated' as const) : ('open' as const),
      }));
      const carriedTicketId = carrying ? (tickets[0]?.id ?? null) : null;
      useGameStore.setState({
        activeDay: {
          ...activeDay,
          floor: {
            ...floor,
            pool: floor.pool.map((guest) =>
              customers.some((customer) => customer.id === guest.customer.id)
                ? { ...guest, stage: 'ordered' as const }
                : guest,
            ),
            tickets,
            carriedTicketId,
            selectedTicketId: carrying
              ? null
              : (tickets.find((ticket) => ticket.status === 'open')?.id ??
                null),
          },
        },
      });
    },

    openComposeSheet() {
      useGameStore.getState().openComposeSheet();
    },

    openFlavorInspector(ingredientId) {
      useGameStore.getState().openFlavorInspector(ingredientId);
    },

    setFloorToast(message) {
      useGameStore.getState().setFloorToast(message);
    },

    enqueueCelebration(celebration) {
      useGameStore.getState().enqueueCelebration(celebration);
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
        const target = floor().pool.find(
          (guest) => guest.customer.id === toOrder[0],
        );
        if (target?.seat) {
          useGameStore.getState().setFloorNavPosition({ ...target.seat });
        }
        await dispatch({
          type: 'FLOOR_TAKE_ORDERS',
          customerIds: [toOrder[0]!],
        });
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
