import { describe, expect, it } from 'vitest';
import { gameReducer, type GameAction } from '../../domain/reducer.ts';
import { createNewGameState, type GameState } from '../../domain/state/game-state.ts';
import {
  canEnqueue,
  deliverTicket,
  enqueueTickets,
  plateTicket,
  resolveFloorComposeTicket,
  resolveFloorTicket,
  selectFloorTicket,
  setFloorTicketDraft,
} from '../../domain/floor/tickets.ts';
import type { FloorDay, FloorTicket } from '../../domain/floor/types.ts';
import { testContext } from '../test-helpers.ts';

function openTicket(id: string, customerId: string): FloorTicket {
  return { id, customerId, ingredientIds: [], status: 'open' };
}

function dayWithTickets(tickets: FloorTicket[]): FloorDay {
  return {
    pool: [],
    tables: [],
    seats: [],
    tickets,
    carriedTicketId: null,
    selectedTicketId: tickets.find((ticket) => ticket.status === 'open')?.id ?? null,
    tutorialStep: null,
    playerPosition: { x: 0, y: 0 },
  };
}

function stateWithTickets(tickets: FloorTicket[]): GameState {
  const state = gameReducer(
    createNewGameState(123),
    { type: 'OPEN_DAY' },
    testContext,
  ).state;
  state.activeDay = {
    ...state.activeDay!,
    floor: dayWithTickets(tickets),
  };
  return state;
}

describe('tickets', () => {
  it('caps active tickets at 4', () => {
    const four = [1, 2, 3, 4].map((n) => openTicket(`t${n}`, `c${n}`));
    expect(canEnqueue(four, 1)).toBe(false);
    expect(() => enqueueTickets(four, [openTicket('t5', 'c5')])).toThrow();
  });

  it('resolves carried, selected, and first-open tickets in canonical priority', () => {
    const first = openTicket('t1', 'c1');
    const selected = openTicket('t2', 'c2');
    const carried = { ...openTicket('t3', 'c3'), status: 'plated' as const };
    const floor = {
      ...dayWithTickets([first, selected, carried]),
      selectedTicketId: selected.id,
      carriedTicketId: carried.id,
    };

    expect(resolveFloorTicket(floor)?.id).toBe(carried.id);
    expect(resolveFloorComposeTicket(floor)).toBeNull();
    const staleCarry = { ...floor, carriedTicketId: 'stale' };
    expect(resolveFloorTicket(staleCarry)?.id).toBe(selected.id);
    expect(resolveFloorComposeTicket(staleCarry)?.id).toBe(selected.id);
    expect(
      resolveFloorTicket({ ...floor, carriedTicketId: null, selectedTicketId: 'stale' })?.id,
    ).toBe(first.id);
  });

  it('keeps independent A/B drafts when switching A → B → A', () => {
    const ids = createNewGameState(1).unlockedIngredientIds;
    let state = stateWithTickets([openTicket('a', 'c1'), openTicket('b', 'c2')]);

    state = gameReducer(
      state,
      { type: 'FLOOR_SET_TICKET_DRAFT', ticketId: 'a', ingredientIds: ids.slice(0, 3) },
      testContext,
    ).state;
    state = gameReducer(
      state,
      { type: 'FLOOR_SELECT_TICKET', ticketId: 'b' },
      testContext,
    ).state;
    state = gameReducer(
      state,
      { type: 'FLOOR_SET_TICKET_DRAFT', ticketId: 'b', ingredientIds: ids.slice(3, 6) },
      testContext,
    ).state;
    state = gameReducer(
      state,
      { type: 'FLOOR_SELECT_TICKET', ticketId: 'a' },
      testContext,
    ).state;

    const floor = state.activeDay!.floor!;
    expect(resolveFloorComposeTicket(floor)?.ingredientIds).toEqual(ids.slice(0, 3));
    expect(floor.tickets.find((ticket) => ticket.id === 'b')?.ingredientIds).toEqual(
      ids.slice(3, 6),
    );
  });

  it('rejects missing/non-open selection and non-null selection while carrying', () => {
    const delivered = { ...openTicket('done', 'c3'), status: 'delivered' as const };
    const floor = dayWithTickets([openTicket('a', 'c1'), delivered]);
    expect(() => selectFloorTicket(floor, 'missing')).toThrow(/Unknown ticket/);
    expect(() => selectFloorTicket(floor, 'done')).toThrow(/not open/);
    const carrying = {
      ...floor,
      tickets: [
        ...floor.tickets,
        { ...openTicket('dish', 'c4'), status: 'plated' as const },
      ],
      carriedTicketId: 'dish',
    };
    expect(() =>
      selectFloorTicket(carrying, 'a'),
    ).toThrow(/while carrying/);
    expect(selectFloorTicket(carrying, null).selectedTicketId).toBeNull();
  });

  it('validates draft and plating bounds, identity, uniqueness, knowledge, and unlocks', () => {
    const ids = createNewGameState(1).unlockedIngredientIds;
    const locked = [...testContext.ingredientsById.keys()].find((id) => !ids.includes(id))!;
    let state = stateWithTickets([openTicket('a', 'c1'), openTicket('b', 'c2')]);

    const invalidActions: GameAction[] = [
      { type: 'FLOOR_SET_TICKET_DRAFT', ticketId: 'b', ingredientIds: ids.slice(0, 3) },
      { type: 'FLOOR_SET_TICKET_DRAFT', ticketId: 'a', ingredientIds: [ids[0]!, ids[0]!] },
      { type: 'FLOOR_SET_TICKET_DRAFT', ticketId: 'a', ingredientIds: ['unknown'] },
      { type: 'FLOOR_SET_TICKET_DRAFT', ticketId: 'a', ingredientIds: [locked] },
      { type: 'FLOOR_SET_TICKET_DRAFT', ticketId: 'a', ingredientIds: [...ids.slice(0, 6), ids[6]!] },
    ];
    for (const action of invalidActions) {
      const before = structuredClone(state);
      expect(() => gameReducer(state, action, testContext)).toThrow();
      expect(state).toEqual(before);
    }

    state = gameReducer(
      state,
      { type: 'FLOOR_SET_TICKET_DRAFT', ticketId: 'a', ingredientIds: ids.slice(0, 2) },
      testContext,
    ).state;
    expect(() =>
      gameReducer(state, { type: 'FLOOR_PLATE', ticketId: 'a' }, testContext),
    ).toThrow(/3-6/);

    for (const badDraft of [
      [...ids.slice(0, 6), ids[6]!],
      [ids[0]!, ids[0]!, ids[1]!],
      [ids[0]!, ids[1]!, 'unknown'],
      [ids[0]!, ids[1]!, locked],
    ]) {
      const floor = state.activeDay!.floor!;
      const withBadDraft = {
        ...state,
        activeDay: {
          ...state.activeDay!,
          floor: {
            ...floor,
            tickets: floor.tickets.map((ticket) =>
              ticket.id === 'a' ? { ...ticket, ingredientIds: badDraft } : ticket,
            ),
          },
        },
      };
      expect(() =>
        gameReducer(withBadDraft, { type: 'FLOOR_PLATE', ticketId: 'a' }, testContext),
      ).toThrow();
    }
  });

  it('plates the stored draft and enforces the one-carry invariant', () => {
    const ids = createNewGameState(1).unlockedIngredientIds.slice(0, 3);
    let floor = dayWithTickets([openTicket('t1', 'c1'), openTicket('t2', 'c2')]);
    floor = setFloorTicketDraft(floor, 't1', ids);
    floor = plateTicket(floor, 't1');
    expect(floor.carriedTicketId).toBe('t1');
    expect(floor.tickets.find((ticket) => ticket.id === 't1')).toMatchObject({
      status: 'plated',
      ingredientIds: ids,
    });
    expect(() => plateTicket({ ...floor, carriedTicketId: null }, 't2')).toThrow(
      /Already carrying/,
    );
    const delivered = deliverTicket(floor.tickets, 't1');
    expect(delivered.find((ticket) => ticket.id === 't1')!.status).toBe('delivered');
  });
});
