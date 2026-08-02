import { computeCameraCenter, gridToWorld, worldToScreen } from '../canvas/coordinates.ts';
import { findBestMatchCombo } from '../domain/day/customer-request-generator.ts';
import { isDayComplete } from '../domain/day/serve.ts';
import type { GameAction } from '../domain/reducer.ts';
import { exportSaveCode as encodeSaveCode } from '../persistence/saveCode.ts';
import { getGameStateSnapshot, useGameStore, type Celebration } from '../store/game-store.ts';
import { selectComposeDraftIds } from '../store/selectors/service-day.ts';
import { getDomainContext, isRecipesContentReady, isScoringContentReady } from './content-loader.ts';
import type { RestaurantApp } from '../canvas/RestaurantApp.ts';
import { walkBlockedCells } from '../canvas/world/blocked-cells.ts';
import { findPath } from '../domain/floor/pathfinding.ts';
import { guestServicePositions } from '../domain/floor/interact.ts';
import type { SeatSlot } from '../domain/floor/types.ts';

function reachableMainFloorCellBeside(seat: Pick<SeatSlot, 'x' | 'y'>): {
  x: number;
  y: number;
} {
  const state = useGameStore.getState();
  const floor = state.activeDay?.floor;
  if (!floor) throw new Error('No active floor for guest approach');
  const blocked = walkBlockedCells(state.placements, state.gridSize.w, state.gridSize.h, {
    kitchenAnnexOwned: state.kitchenAnnexOwned,
    room: 'main',
  });
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const candidate = { x: seat.x + dx, y: seat.y + dy };
      if (
        candidate.x < 0 ||
        candidate.y < 0 ||
        candidate.x >= state.gridSize.w ||
        candidate.y >= state.gridSize.h ||
        blocked.has(`${candidate.x},${candidate.y}`)
      ) {
        continue;
      }
      if (findPath({ w: state.gridSize.w, h: state.gridSize.h, blocked }, floor.playerPosition, candidate)) {
        return candidate;
      }
    }
  }
  throw new Error('No reachable floor cell beside guest seat');
}

function reachableGuestServiceCell(seat: Pick<SeatSlot, 'x' | 'y'>): {
  x: number;
  y: number;
} {
  const state = useGameStore.getState();
  const floor = state.activeDay?.floor;
  if (!floor) throw new Error('No active floor for guest approach');
  const blocked = walkBlockedCells(state.placements, state.gridSize.w, state.gridSize.h, {
    kitchenAnnexOwned: state.kitchenAnnexOwned,
    room: 'main',
  });
  for (const candidate of guestServicePositions(seat)) {
    if (
      candidate.x < 0 ||
      candidate.y < 0 ||
      candidate.x >= state.gridSize.w ||
      candidate.y >= state.gridSize.h ||
      blocked.has(`${candidate.x},${candidate.y}`)
    ) {
      continue;
    }
    if (
      findPath(
        { w: state.gridSize.w, h: state.gridSize.h, blocked },
        floor.playerPosition,
        candidate,
      )
    ) {
      return candidate;
    }
  }
  throw new Error('No reachable service position near guest seat');
}

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
    floorTicketDrafts: Record<string, string[]>;
    selectedTicketId: string | null;
    composeSheetOpen: boolean;
    pendingPlacementItemKey: string | null;
    screen: string;
    activeFloorRoom: string;
    floorPlayerGrid: { x: number; y: number } | null;
  };
  getGameState: () => ReturnType<typeof getGameStateSnapshot>;
  isScoringReady: () => boolean;
  isRecipesReady: () => boolean;
  gridCellToScreen: (gx: number, gy: number) => { x: number; y: number };
  exportSaveCode: () => string;
  /** Drive one step of the floor service loop (for e2e smoke). */
  advanceFloorServiceOnce: () => Promise<'pending_review' | 'day_complete' | 'advanced' | 'idle'>;
  /** Run the full floor day to summary (dismisses reviews, closes day). */
  completeFloorServiceDay: () => Promise<void>;
  dispatch: (action: GameAction) => Promise<void>;
  setFloorNavPosition: (pos: { x: number; y: number }) => void;
  dismissPendingReview: () => void;
  prepareCookUiFixture: () => Promise<void>;
  prepareTicketPanelFixture: (ticketCount: number, carrying?: boolean) => Promise<void>;
  prepareDecorVisualFixture: () => void;
  prepareEquipmentVisualFixture: () => void;
  unlockKitchenAnnexForTest: () => void;
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
  /** Debug: current rendered anchor for one guest actor. */
  getGuestScreenAnchor: (guestId: string) => { x: number; y: number } | null;
  /** Debug: current rendered feet anchor for Val. */
  getPlayerScreenFeetAnchor: () => { x: number; y: number } | null;
  /** Debug: current rendered feet anchor for one guest actor. */
  getGuestScreenFeetAnchor: (guestId: string) => { x: number; y: number } | null;
  /** Debug: whether a world-space tap affordance is currently rendered. */
  getInteractHintVisible: () => boolean;
  /** Debug: exact grid cells currently carrying tap affordances. */
  getInteractHintCells: () => Array<{ x: number; y: number }>;
  /** Debug: whether a ticket currently owns the async delivery boundary. */
  isDeliveryPending: (ticketId: string) => boolean;
  setFloorToast: (message: string | null) => void;
  enqueueCelebration: (celebration: Celebration) => void;
}

declare global {
  interface Window {
    __E2E__?: E2eBridge;
  }
}

/** Hooks for Playwright when `?e2e=1` is present. */
export function installE2eBridge(getRestaurantApp: () => RestaurantApp | null): void {
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
      const floor = s.activeDay?.floor;
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
        composeDraftIngredientIds: selectComposeDraftIds(s),
        floorTicketDrafts: Object.fromEntries(
          floor?.tickets.map((ticket) => [ticket.id, [...ticket.ingredientIds]]) ?? [],
        ),
        selectedTicketId: floor?.selectedTicketId ?? null,
        composeSheetOpen: s.composeSheetOpen,
        pendingPlacementItemKey: s.pendingPlacementItemKey,
        screen: s.screen,
        activeFloorRoom: s.activeFloorRoom,
        floorPlayerGrid: s.floorPlayerGrid,
      };
    },

    getGameState: () => getGameStateSnapshot(),

    isScoringReady: () => isScoringContentReady(),

    isRecipesReady: () => isRecipesContentReady(),

    gridCellToScreen(gx: number, gy: number) {
      const canvas = document.querySelector('[data-testid="restaurant-canvas"]') as HTMLCanvasElement | null;
      if (!canvas) {
        throw new Error('restaurant canvas not mounted');
      }
      const rect = canvas.getBoundingClientRect();
      const state = useGameStore.getState();
      const camera =
        getRestaurantApp()?.camera.state ??
        computeCameraCenter(state.gridSize.w, state.gridSize.h, canvas.clientWidth, canvas.clientHeight);
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

    getGuestScreenAnchor(guestId) {
      return getRestaurantApp()?.getGuestScreenAnchor(guestId) ?? null;
    },

    getPlayerScreenFeetAnchor() {
      return getRestaurantApp()?.getPlayerScreenFeetAnchor() ?? null;
    },

    getGuestScreenFeetAnchor(guestId) {
      return getRestaurantApp()?.getGuestScreenFeetAnchor(guestId) ?? null;
    },

    getInteractHintVisible() {
      return Boolean(getRestaurantApp()?.interactHintLayer.view.visible);
    },

    getInteractHintCells() {
      return getRestaurantApp()?.interactHintLayer.getCells() ?? [];
    },

    isDeliveryPending(ticketId) {
      return getRestaurantApp()?.isDeliveryPending(ticketId) ?? false;
    },

    dismissPendingReview() {
      useGameStore.getState().dismissPendingReview();
    },

    async prepareCookUiFixture() {
      if (!useGameStore.getState().activeDay) {
        await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
      }
      await useGameStore.getState().dismissModifier();

      const floor = useGameStore.getState().activeDay!.floor!;
      for (const table of floor.tables) {
        if (table.state === 'unset') {
          await useGameStore.getState().dispatch({
            type: 'FLOOR_SET_TABLE',
            placementId: table.placementId,
          });
        }
      }
      if (useGameStore.getState().activeDay!.floor!.pool.some((guest) => guest.stage === 'entering')) {
        await useGameStore.getState().dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
      }
      if (useGameStore.getState().activeDay!.floor!.pool.some((guest) => guest.stage === 'waiting')) {
        await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
      }
      const seatingGuest = useGameStore.getState().activeDay!.floor!.pool.find((guest) => guest.stage === 'seating');
      if (seatingGuest) {
        await useGameStore.getState().dispatch({
          type: 'FLOOR_COMPLETE_SEATING',
          guestId: seatingGuest.id,
        });
      }
      const customerIds = useGameStore
        .getState()
        .activeDay!.floor!.pool.filter((guest) => guest.stage === 'seated')
        .map((guest) => guest.customer.id);
      if (customerIds.length > 0) {
        const target = useGameStore
          .getState()
          .activeDay!.floor!.pool.find((guest) => guest.customer.id === customerIds[0]);
        if (target?.seat) {
          useGameStore.getState().setFloorNavPosition(reachableGuestServiceCell(target.seat));
        }
        await useGameStore.getState().dispatch({
          type: 'FLOOR_TAKE_ORDERS',
          customerIds: [customerIds[0]!],
        });
      }

      const current = useGameStore.getState();
      const station = current.placements.find((placement) => placement.itemKey === 'prep_station');
      const openTicket = current.activeDay!.floor!.tickets.find((ticket) => ticket.status === 'open');
      if (!station || !openTicket) {
        throw new Error('cook UI fixture could not create a station and open ticket');
      }
      useGameStore.setState({
        unlockedIngredientIds: getDomainContext().ingredients.map((ingredient) => ingredient.id),
      });
      useGameStore.getState().setFloorSelectedTicket(openTicket.id);
      useGameStore.getState().setActiveFloorRoom('main');
      const cookPosition = reachableMainFloorCellBeside(station);
      const restaurantApp = getRestaurantApp();
      restaurantApp?.app.stop();
      restaurantApp?.nav.snapTo(cookPosition);
      useGameStore.getState().setFloorNavPosition(cookPosition);
    },

    async prepareTicketPanelFixture(ticketCount, carrying = false) {
      if (!Number.isInteger(ticketCount) || ticketCount < 0 || ticketCount > 4) {
        throw new Error('ticket panel fixture count must be between 0 and 4');
      }
      if (!useGameStore.getState().activeDay) {
        await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
      }
      await useGameStore.getState().dismissModifier();

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
        status: carrying && index === 0 ? ('plated' as const) : ('open' as const),
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
            selectedTicketId: carrying ? null : (tickets.find((ticket) => ticket.status === 'open')?.id ?? null),
          },
        },
      });
    },

    prepareDecorVisualFixture() {
      const current = useGameStore.getState();
      const decor = [
        { id: 'qa_decor_plant', itemKey: 'decor_plant', x: 1, y: 1, rotation: 0 },
        { id: 'qa_decor_flowers', itemKey: 'decor_flowers', x: 3, y: 1, rotation: 0 },
        { id: 'qa_decor_lamp', itemKey: 'decor_lamp', x: 6, y: 1, rotation: 0 },
        { id: 'qa_decor_rug', itemKey: 'decor_rug', x: 4, y: 4, rotation: 0 },
        { id: 'qa_decor_sign', itemKey: 'decor_sign', x: 1, y: 4, rotation: 0 },
      ];
      useGameStore.setState({
        placements: [
          ...current.placements.filter((placement) => !placement.itemKey.startsWith('decor_')),
          ...decor,
        ],
        decorPurchasedCounts: {
          decor_plant: 1,
          decor_flowers: 1,
          decor_rug: 1,
          decor_lamp: 1,
          decor_sign: 1,
        },
        editLayoutMode: true,
      });
    },

    prepareEquipmentVisualFixture() {
      const current = useGameStore.getState();
      const equipment = [
        { id: 'qa_equipment_smoker', itemKey: 'smoker', x: 1, y: 2, rotation: 0 },
        {
          id: 'qa_equipment_spice_rack',
          itemKey: 'spice_rack',
          x: 2,
          y: 2,
          rotation: 0,
        },
      ];
      useGameStore.setState({
        kitchenAnnexOwned: true,
        activeFloorRoom: 'back_kitchen',
        backKitchenPlacements: equipment,
        purchasedEquipmentIds: [
          ...new Set([...current.purchasedEquipmentIds, 'smoker', 'spice_rack']),
        ],
        editLayoutMode: true,
      });
    },

    unlockKitchenAnnexForTest() {
      useGameStore.setState({ kitchenAnnexOwned: true });
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
      const dispatch = (action: GameAction) => useGameStore.getState().dispatch(action);

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

      const seatingGuest = floor().pool.find((g) => g.stage === 'seating');
      if (seatingGuest) {
        await dispatch({
          type: 'FLOOR_COMPLETE_SEATING',
          guestId: seatingGuest.id,
        });
      }

      const toOrder = floor()
        .pool.filter((g) => g.stage === 'seated')
        .map((g) => g.customer.id);
      if (toOrder.length > 0) {
        const target = floor().pool.find((guest) => guest.customer.id === toOrder[0]);
        if (target?.seat) {
          useGameStore.getState().setFloorNavPosition(reachableGuestServiceCell(target.seat));
        }
        await dispatch({
          type: 'FLOOR_TAKE_ORDERS',
          customerIds: [toOrder[0]!],
        });
      }

      if (useGameStore.getState().pendingReview) return 'pending_review';

      const open = floor().tickets.find((t) => t.status === 'open');
      if (open && !floor().carriedTicketId) {
        const guest = floor().pool.find((g) => g.customer.id === open.customerId);
        if (guest) {
          const beforeCook = useGameStore.getState();
          const unlocked = beforeCook.unlockedIngredientIds;
          const combo = findBestMatchCombo(
            unlocked,
            guest.customer.preference,
            ctx.ingredientsById,
            ctx.compoundAffinity,
          );
          const station = beforeCook.placements.find((placement) =>
            beforeCook.purchasedEquipmentIds.includes(placement.itemKey),
          );
          if (!station) throw new Error('floor service fixture has no owned cook station');
          beforeCook.setActiveFloorRoom('main');
          beforeCook.setFloorNavPosition(reachableMainFloorCellBeside(station));
          await dispatch({
            type: 'FLOOR_SET_TICKET_DRAFT',
            ticketId: open.id,
            ingredientIds: combo.ingredientIds,
          });
          await dispatch({
            type: 'FLOOR_PLATE',
            ticketId: open.id,
          });
          if (guest.seat) {
            useGameStore.getState().setFloorNavPosition(reachableGuestServiceCell(guest.seat));
          }
          await dispatch({ type: 'FLOOR_DELIVER', ticketId: open.id });
        }
      }

      if (useGameStore.getState().pendingReview) return 'pending_review';

      if (floor().pool.some((g) => g.stage === 'eating')) {
        await dispatch({ type: 'FLOOR_TICK_EATING' });
      }

      const leavingGuest = floor().pool.find((g) => g.stage === 'leaving');
      if (leavingGuest) {
        await dispatch({
          type: 'FLOOR_COMPLETE_LEAVING',
          guestId: leavingGuest.id,
        });
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
