import { afterEach, describe, expect, it } from 'vitest';
import {
  clearTutorialSkip,
  isTutorialSkipped,
  nextTutorialStep,
  skipTutorial,
  tutorialPrompt,
} from '../domain/floor/tutorial.ts';
import type { FloorDay } from '../domain/floor/types.ts';
import {
  createFloorDayFromCustomers,
  tablesFromPlacements,
} from '../domain/floor/sim.ts';
import { seatsFromPlacements } from '../domain/floor/seats.ts';
import type { Customer } from '../domain/day/types.ts';
import {
  hudDetailDialogAria,
  hudDetailDialogAriaAttrString,
} from '../ui/presentation/hud-detail-dialog.ts';

const customer: Customer = {
  id: 'c1',
  archetypeId: 'a',
  preference: { primary: {}, avoid: {}, phrases: [] },
};

const placements = [
  { id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
];

function baseDay(): FloorDay {
  return createFloorDayFromCustomers(
    [customer],
    tablesFromPlacements(placements),
    seatsFromPlacements(placements),
  );
}

describe('chrome tutorial skip affordance', () => {
  afterEach(() => {
    clearTutorialSkip();
  });

  it('skipTutorial dismisses guidance without changing progression rules', () => {
    const day = baseDay();
    expect(nextTutorialStep(day, true)).toBe('set_tables');
    expect(tutorialPrompt('set_tables')).toMatch(/set every table/i);

    skipTutorial();
    expect(isTutorialSkipped()).toBe(true);
    expect(nextTutorialStep(day, true)).toBeNull();
    // Progression helpers still describe the same step when asked directly.
    expect(tutorialPrompt('set_tables')).toMatch(/set every table/i);
  });

  it('clearTutorialSkip re-arms day-1 guidance (replay path)', () => {
    const day = baseDay();
    skipTutorial();
    expect(nextTutorialStep(day, true)).toBeNull();
    clearTutorialSkip();
    expect(isTutorialSkipped()).toBe(false);
    expect(nextTutorialStep(day, true)).toBe('set_tables');
  });

  it('leaving day-1 (enabled=false) clears skip for a fresh run', () => {
    const day = baseDay();
    skipTutorial();
    expect(nextTutorialStep(day, false)).toBeNull();
    expect(isTutorialSkipped()).toBe(false);
    expect(nextTutorialStep(day, true)).toBe('set_tables');
  });
});

describe('chrome HUD detail popover dialog semantics', () => {
  it('exposes non-modal dialog role + labelledby for HUD popovers', () => {
    expect(hudDetailDialogAria()).toEqual({
      role: 'dialog',
      'aria-modal': 'false',
      'aria-labelledby': 'hud-detail-title',
    });
    expect(hudDetailDialogAriaAttrString()).toContain('role="dialog"');
    expect(hudDetailDialogAriaAttrString()).toContain('aria-modal="false"');
    expect(hudDetailDialogAriaAttrString()).toContain(
      'aria-labelledby="hud-detail-title"',
    );
  });
});
