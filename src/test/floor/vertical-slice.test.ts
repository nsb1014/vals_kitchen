import { describe, expect, it } from 'vitest';
import { findBestMatchCombo } from '../../domain/day/customer-request-generator.ts';
import { isDayComplete } from '../../domain/day/serve.ts';
import { gameReducer } from '../../domain/reducer.ts';
import { createNewGameState } from '../../domain/state/game-state.ts';
import type { GameState } from '../../domain/state/game-state.ts';
import type { SeatSlot } from '../../domain/floor/types.ts';
import { findPath } from '../../domain/floor/pathfinding.ts';
import { walkBlockedCells } from '../../canvas/world/blocked-cells.ts';
import { testContext } from '../test-helpers.ts';

function reachableAdjacentCell(state: GameState, seat: SeatSlot) {
  const floor = state.activeDay!.floor!;
  const blocked = walkBlockedCells(
    state.placements,
    state.gridSize.w,
    state.gridSize.h,
    { kitchenAnnexOwned: state.kitchenAnnexOwned, room: 'main' },
  );
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
      const path = findPath(
        { w: state.gridSize.w, h: state.gridSize.h, blocked },
        floor.playerPosition,
        candidate,
      );
      if (path) return candidate;
    }
  }
  throw new Error('No reachable floor cell beside guest seat');
}

describe('floor vertical slice loop', () => {
  it('set → seat → order → plate → deliver → eat → clear → complete', () => {
    let state = createNewGameState(99);
    // Ensure tables exist
    expect(state.placements.filter((p) => p.itemKey.startsWith('table')).length).toBeGreaterThan(0);

    state = gameReducer(state, { type: 'OPEN_DAY' }, testContext).state;
    expect(state.activeDay?.floor).toBeTruthy();

    for (const table of state.activeDay!.floor!.tables) {
      state = gameReducer(state, { type: 'FLOOR_SET_TABLE', placementId: table.placementId }, testContext)
        .state;
    }

    state = gameReducer(state, { type: 'FLOOR_COMPLETE_ENTERING' }, testContext).state;
    state = gameReducer(state, { type: 'FLOOR_SEAT_NEXT' }, testContext).state;
    const seated = state.activeDay!.floor!.pool.find((g) => g.stage === 'seated');
    expect(seated).toBeTruthy();
    state = {
      ...state,
      activeDay: {
        ...state.activeDay!,
        floor: {
          ...state.activeDay!.floor!,
          playerPosition: reachableAdjacentCell(state, seated!.seat!),
        },
      },
    };

    state = gameReducer(
      state,
      { type: 'FLOOR_TAKE_ORDERS', customerIds: [seated!.customer.id] },
      testContext,
    ).state;
    const ticket = state.activeDay!.floor!.tickets[0]!;
    expect(ticket.status).toBe('open');

    const best = findBestMatchCombo(
      state.unlockedIngredientIds,
      seated!.customer.preference,
      testContext.ingredientsById,
      testContext.compoundAffinity,
    );

    state = gameReducer(
      state,
      { type: 'FLOOR_PLATE', ticketId: ticket.id, ingredientIds: best.ingredientIds },
      testContext,
    ).state;
    expect(state.activeDay!.floor!.carriedTicketId).toBe(ticket.id);

    state = {
      ...state,
      activeDay: {
        ...state.activeDay!,
        floor: {
          ...state.activeDay!.floor!,
          playerPosition: reachableAdjacentCell(state, seated!.seat!),
        },
      },
    };
    const cashBefore = state.cash;
    state = gameReducer(state, { type: 'FLOOR_DELIVER', ticketId: ticket.id }, testContext).state;
    expect(state.cash).toBeGreaterThanOrEqual(cashBefore);
    expect(state.activeDay!.floor!.pool.find((g) => g.customer.id === seated!.customer.id)!.stage).toBe(
      'eating',
    );

    // Finish this guest's meal
    while (
      state.activeDay!.floor!.pool.find((g) => g.customer.id === seated!.customer.id)!.stage ===
      'eating'
    ) {
      state = gameReducer(state, { type: 'FLOOR_TICK_EATING' }, testContext).state;
    }

    const dirty = state.activeDay!.floor!.tables.find((t) => t.state === 'dirty');
    expect(dirty).toBeTruthy();
    state = gameReducer(
      state,
      { type: 'FLOOR_CLEAR_TABLE', placementId: dirty!.placementId },
      testContext,
    ).state;

    // Serve remaining guests via floor loop until day complete
    let guard = 0;
    while (!isDayComplete(state) && guard++ < 200) {
      const floor = state.activeDay!.floor!;
      for (const t of floor.tables) {
        if (t.state === 'unset') {
          state = gameReducer(state, { type: 'FLOOR_SET_TABLE', placementId: t.placementId }, testContext)
            .state;
        }
        if (t.state === 'dirty') {
          state = gameReducer(state, { type: 'FLOOR_CLEAR_TABLE', placementId: t.placementId }, testContext)
            .state;
        }
      }

      const entering = state.activeDay!.floor!.pool.some((g) => g.stage === 'entering');
      if (entering) {
        state = gameReducer(state, { type: 'FLOOR_COMPLETE_ENTERING' }, testContext).state;
      }

      const waiting = state.activeDay!.floor!.pool.some((g) => g.stage === 'waiting');
      if (waiting) {
        state = gameReducer(state, { type: 'FLOOR_SEAT_NEXT' }, testContext).state;
      }

      const toOrder = state.activeDay!.floor!.pool
        .filter((g) => g.stage === 'seated')
        .map((g) => g.customer.id);
      if (toOrder.length) {
        const target = state.activeDay!.floor!.pool.find(
          (guest) => guest.customer.id === toOrder[0],
        )!;
        state = {
          ...state,
          activeDay: {
            ...state.activeDay!,
            floor: {
              ...state.activeDay!.floor!,
              playerPosition: reachableAdjacentCell(state, target.seat!),
            },
          },
        };
        state = gameReducer(state, { type: 'FLOOR_TAKE_ORDERS', customerIds: toOrder }, testContext)
          .state;
      }

      const open = state.activeDay!.floor!.tickets.find((t) => t.status === 'open');
      if (open && !state.activeDay!.floor!.carriedTicketId) {
        const guest = state.activeDay!.floor!.pool.find((g) => g.customer.id === open.customerId)!;
        const combo = findBestMatchCombo(
          state.unlockedIngredientIds,
          guest.customer.preference,
          testContext.ingredientsById,
          testContext.compoundAffinity,
        );
        state = gameReducer(
          state,
          { type: 'FLOOR_PLATE', ticketId: open.id, ingredientIds: combo.ingredientIds },
          testContext,
        ).state;
        state = {
          ...state,
          activeDay: {
            ...state.activeDay!,
            floor: {
              ...state.activeDay!.floor!,
              playerPosition: reachableAdjacentCell(state, guest.seat!),
            },
          },
        };
        state = gameReducer(state, { type: 'FLOOR_DELIVER', ticketId: open.id }, testContext).state;
      }

      if (
        state.activeDay!.floor!.pool.some((g) => g.stage === 'eating' || g.stage === 'leaving')
      ) {
        state = gameReducer(state, { type: 'FLOOR_TICK_EATING' }, testContext).state;
      }
    }

    expect(isDayComplete(state)).toBe(true);
    state = gameReducer(state, { type: 'CLOSE_DAY' }, testContext).state;
    expect(state.activeDay).toBeNull();
  });
});
