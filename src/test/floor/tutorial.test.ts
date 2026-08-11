import { afterEach, describe, expect, it } from 'vitest';
import { createFloorDayFromCustomers, tablesFromPlacements } from '../../domain/floor/sim.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import { setTable } from '../../domain/floor/tables.ts';
import {
  clearTutorialSkip,
  nextTutorialStep,
  skipTutorial,
  tutorialPrompt,
} from '../../domain/floor/tutorial.ts';
import type { Customer } from '../../domain/day/types.ts';
import type { FloorDay } from '../../domain/floor/types.ts';
import {
  buildFloorTutorialNotice,
  resolveFloorHudHint,
} from '../../ui/components/FloorServiceHud.ts';

const customer: Customer = {
  id: 'c1',
  archetypeId: 'a',
  preference: { primary: {}, avoid: {}, phrases: [] },
};

const placements = [{ id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 }];

function baseDay(): FloorDay {
  return createFloorDayFromCustomers(
    [customer],
    tablesFromPlacements(placements),
    seatsFromPlacements(placements),
  );
}

function withSetTables(day: FloorDay): FloorDay {
  return { ...day, tables: day.tables.map(setTable) };
}

function withGuestStage(
  day: FloorDay,
  stage: FloorDay['pool'][number]['stage'],
): FloorDay {
  return {
    ...day,
    pool: day.pool.map((guest, index) =>
      index === 0
        ? { ...guest, stage, eatTicksRemaining: stage === 'eating' ? 2 : 0 }
        : guest,
    ),
  };
}

function withDeliveredTicket(day: FloorDay): FloorDay {
  return {
    ...day,
    tickets: [
      {
        id: 't1',
        customerId: customer.id,
        ingredientIds: ['i1'],
        status: 'delivered',
      },
    ],
  };
}

describe('tutorial', () => {
  it('starts at set_tables until tables are set', () => {
    const day = baseDay();
    expect(nextTutorialStep(day, true)).toBe('set_tables');
    expect(tutorialPrompt('set_tables')).toMatch(/Set every table/i);
    expect(tutorialPrompt('set_tables')).toMatch(/guest/i);

    expect(nextTutorialStep(withSetTables(day), true)).toBe('wait_seat');
    expect(tutorialPrompt('wait_seat')).toMatch(/Seat the next guest/);
  });

  it('gives each physical seating phase a distinct notice identity and body', () => {
    const entering = withSetTables(baseDay());
    const waiting: FloorDay = {
      ...entering,
      pool: entering.pool.map((guest, index) =>
        index === 0 ? { ...guest, stage: 'waiting' as const } : guest,
      ),
    };
    const seating: FloorDay = {
      ...waiting,
      pool: waiting.pool.map((guest, index) =>
        index === 0 ? { ...guest, stage: 'seating' as const } : guest,
      ),
    };
    const prompt = tutorialPrompt('wait_seat');

    expect(
      buildFloorTutorialNotice(entering, 'wait_seat', prompt),
    ).toEqual({
      id: 'tutorial:wait_seat:entering',
      body: 'The first guest is arriving…',
    });
    expect(buildFloorTutorialNotice(waiting, 'wait_seat', prompt)).toEqual({
      id: 'tutorial:wait_seat:waiting',
      body: 'Seat the waiting guest.',
    });
    expect(buildFloorTutorialNotice(seating, 'wait_seat', prompt)).toEqual({
      id: 'tutorial:wait_seat:seating',
      body: 'Guest is heading to the table…',
    });
  });

  it('prompts take_orders when a guest is seated', () => {
    const day = withSetTables(baseDay());
    const seated = {
      ...day,
      pool: [{ ...day.pool[0]!, stage: 'seated' as const, eatTicksRemaining: 0 }],
      tables: day.tables.map((t) => ({ ...t, state: 'occupied' as const })),
    };
    expect(nextTutorialStep(seated, true)).toBe('take_orders');
    expect(tutorialPrompt('take_orders')).toMatch(/Take orders/);
  });

  it('prompts cook when an open ticket exists', () => {
    const day = withSetTables(baseDay());
    const cooking = {
      ...day,
      pool: [{ ...day.pool[0]!, stage: 'ordered' as const, eatTicksRemaining: 0 }],
      tickets: [
        {
          id: 't1',
          customerId: 'c1',
          ingredientIds: ['i1'],
          status: 'open' as const,
        },
      ],
    };
    expect(nextTutorialStep(cooking, true)).toBe('cook');
    expect(tutorialPrompt('cook')).toMatch(/Plate a ticket/);
  });

  it('prompts deliver when carrying a plated ticket', () => {
    const day = withSetTables(baseDay());
    const delivering = {
      ...day,
      pool: [{ ...day.pool[0]!, stage: 'ordered' as const, eatTicksRemaining: 0 }],
      tickets: [
        {
          id: 't1',
          customerId: 'c1',
          ingredientIds: ['i1'],
          status: 'plated' as const,
        },
      ],
      carriedTicketId: 't1',
    };
    expect(nextTutorialStep(delivering, true)).toBe('deliver');
    expect(tutorialPrompt('deliver')).toMatch(/Deliver the plated dish/);
  });

  it('prompts clear when a table is dirty', () => {
    const day = withSetTables(baseDay());
    const clearing = {
      ...day,
      pool: [{ ...day.pool[0]!, stage: 'leaving' as const, eatTicksRemaining: 0 }],
      tables: day.tables.map((t) => ({ ...t, state: 'dirty' as const })),
      tickets: [
        {
          id: 't1',
          customerId: 'c1',
          ingredientIds: ['i1'],
          status: 'delivered' as const,
        },
      ],
    };
    expect(nextTutorialStep(clearing, true)).toBe('clear');
    expect(tutorialPrompt('clear')).toMatch(/Clear dirty tables/);
  });

  it('does not invent an action while the only guest is eating or leaving', () => {
    const day = withSetTables(baseDay());

    const eating = withDeliveredTicket(withGuestStage(day, 'eating'));
    expect(nextTutorialStep(eating, true)).toBe('done');
    expect(tutorialPrompt(nextTutorialStep(eating, true))).toBeNull();

    const leaving = withDeliveredTicket(withGuestStage(day, 'leaving'));
    expect(nextTutorialStep(leaving, true)).toBe('done');
    expect(tutorialPrompt(nextTutorialStep(leaving, true))).toBeNull();
  });

  it('keeps real waiting and cleanup actions ahead of passive guests', () => {
    const day = withSetTables(baseDay());
    const secondCustomer: Customer = { ...customer, id: 'c2' };
    const eating = withDeliveredTicket(withGuestStage(day, 'eating'));
    const waitingAndEating: FloorDay = {
      ...eating,
      pool: [
        ...eating.pool,
        {
          id: secondCustomer.id,
          customer: secondCustomer,
          stage: 'waiting',
          eatTicksRemaining: 0,
        },
      ],
    };
    expect(nextTutorialStep(waitingAndEating, true)).toBe('wait_seat');

    const dirtyAndLeaving: FloorDay = {
      ...withDeliveredTicket(withGuestStage(day, 'leaving')),
      tables: day.tables.map((table) => ({ ...table, state: 'dirty' as const })),
    };
    expect(nextTutorialStep(dirtyAndLeaving, true)).toBe('clear');
  });

  it('prompts close when the floor day is complete', () => {
    const day = withSetTables(baseDay());
    const complete = {
      ...day,
      pool: [{ ...day.pool[0]!, stage: 'done' as const, eatTicksRemaining: 0 }],
      tickets: [
        {
          id: 't1',
          customerId: 'c1',
          ingredientIds: ['i1'],
          status: 'delivered' as const,
        },
      ],
    };
    expect(nextTutorialStep(complete, true)).toBe('close');
    expect(tutorialPrompt('close')).toMatch(/close the day/);
    expect(tutorialPrompt('done')).toBeNull();
  });

  it('returns null when tutorial is disabled', () => {
    expect(nextTutorialStep(baseDay(), false)).toBeNull();
  });
});

describe('floor HUD quiet hint', () => {
  afterEach(() => {
    clearTutorialSkip();
  });

  it('surfaces day-1 tutorial copy as a persistent hint, not a banner source', () => {
    const day = baseDay();
    expect(
      resolveFloorHudHint({
        day: 1,
        rating: 3,
        prestige: 0,
        floor: day,
      }),
    ).toMatch(/set every table/i);
  });

  it('returns null after skip so guidance cannot reappear for the rest of day 1', () => {
    skipTutorial();
    expect(
      resolveFloorHudHint({
        day: 1,
        rating: 3,
        prestige: 0,
        floor: withGuestStage(withSetTables(baseDay()), 'waiting'),
      }),
    ).toBeNull();
  });

  it('keeps a single day>1 status line without animation/queue semantics', () => {
    const quietFloor = {
      ...withSetTables(baseDay()),
      pool: withSetTables(baseDay()).pool.map((guest) => ({
        ...guest,
        stage: 'done' as const,
        eatTicksRemaining: 0,
      })),
    };
    expect(
      resolveFloorHudHint({
        day: 2,
        rating: 3.5,
        prestige: 1,
        floor: quietFloor,
        tutorialSkipped: false,
      }),
    ).toMatch(/Day 2 · 3\.5★ · P1/);
  });
});
