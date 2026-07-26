import { describe, expect, it } from 'vitest';
import { createFloorDayFromCustomers, tablesFromPlacements } from '../../domain/floor/sim.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import { setTable } from '../../domain/floor/tables.ts';
import { nextTutorialStep, tutorialPrompt } from '../../domain/floor/tutorial.ts';
import type { Customer } from '../../domain/day/types.ts';
import type { FloorDay } from '../../domain/floor/types.ts';

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

describe('tutorial', () => {
  it('starts at set_tables until tables are set', () => {
    const day = baseDay();
    expect(nextTutorialStep(day, true)).toBe('set_tables');
    expect(tutorialPrompt('set_tables')).toMatch(/Set every table/);

    expect(nextTutorialStep(withSetTables(day), true)).toBe('wait_seat');
    expect(tutorialPrompt('wait_seat')).toMatch(/Seat the next guest/);
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
