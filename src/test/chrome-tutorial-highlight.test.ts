import { describe, expect, it } from 'vitest';
import {
  nextTutorialStep,
  tutorialHighlightTarget,
  tutorialPrompt,
} from '../domain/floor/tutorial.ts';
import { resolveTutorialHighlightPoint } from '../ui/presentation/tutorial-highlight.ts';
import type { FloorDay } from '../domain/floor/types.ts';
import { createStarterMap } from '../domain/floor/starter-map.ts';
import { seatsFromPlacements } from '../domain/floor/seats.ts';
import { tablesFromPlacements } from '../domain/floor/sim.ts';

function bareFloor(overrides: Partial<FloorDay> = {}): FloorDay {
  const map = createStarterMap();
  const tables = tablesFromPlacements(map.placements).map((table) => ({
    ...table,
    state: 'unset' as const,
  }));
  return {
    pool: [],
    tables,
    seats: seatsFromPlacements(map.placements),
    tickets: [],
    carriedTicketId: null,
    selectedTicketId: null,
    tutorialStep: null,
    playerPosition: { x: 3, y: 3 },
    ...overrides,
  };
}

describe('chrome tutorial spatial highlights', () => {
  it('maps tutorial steps to spatial targets', () => {
    expect(tutorialHighlightTarget('set_tables')).toBe('unset_table');
    expect(tutorialHighlightTarget('wait_seat')).toBe('door');
    expect(tutorialHighlightTarget('take_orders')).toBe('seated_guest');
    expect(tutorialHighlightTarget('cook')).toBe('kitchen');
    expect(tutorialHighlightTarget('clear')).toBe('dirty_table');
    expect(tutorialHighlightTarget('done')).toBeNull();
  });

  it('resolves an unset table cell for set_tables', () => {
    const map = createStarterMap();
    const floor = bareFloor();
    expect(nextTutorialStep(floor, true)).toBe('set_tables');
    expect(tutorialPrompt('set_tables')).toMatch(/Set every table/i);
    const point = resolveTutorialHighlightPoint(
      'set_tables',
      floor,
      map.placements,
      map.gridSize,
    );
    expect(point?.target).toBe('unset_table');
    expect(point?.gx).toBeTypeOf('number');
    expect(point?.gy).toBeTypeOf('number');
  });

  it('resolves the guest door for wait_seat', () => {
    const map = createStarterMap();
    const floor = bareFloor({
      tables: bareFloor().tables.map((table) => ({
        ...table,
        state: 'ready',
      })),
      pool: [
        {
          id: 'g1',
          customer: {
            id: 'c1',
            archetypeId: 'a1',
            preference: { primary: {}, avoid: {}, phrases: [] },
          },
          stage: 'waiting',
          eatTicksRemaining: 0,
        },
      ],
    });
    expect(nextTutorialStep(floor, true)).toBe('wait_seat');
    const point = resolveTutorialHighlightPoint(
      'wait_seat',
      floor,
      map.placements,
      map.gridSize,
    );
    expect(point?.target).toBe('door');
    expect(point?.gy).toBe(map.gridSize.h - 1);
  });
});
