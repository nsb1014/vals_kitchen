import { describe, expect, it } from 'vitest';
import { createFloorDayFromCustomers, tablesFromPlacements } from '../../domain/floor/sim.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import { setTable } from '../../domain/floor/tables.ts';
import { nextTutorialStep, tutorialPrompt } from '../../domain/floor/tutorial.ts';
import type { Customer } from '../../domain/day/types.ts';

const customer: Customer = {
  id: 'c1',
  archetypeId: 'a',
  preference: { primary: {}, avoid: {}, phrases: [] },
};

describe('tutorial', () => {
  it('starts at set_tables until tables are set', () => {
    const placements = [{ id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 }];
    const day = {
      ...createFloorDayFromCustomers([customer], tablesFromPlacements(placements)),
      seats: seatsFromPlacements(placements),
    };
    expect(nextTutorialStep(day, true)).toBe('set_tables');
    expect(tutorialPrompt('set_tables')).toMatch(/Set every table/);

    const set = {
      ...day,
      tables: day.tables.map(setTable),
    };
    expect(nextTutorialStep(set, true)).toBe('wait_seat');
  });
});
