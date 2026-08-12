import { describe, expect, it } from 'vitest';
import {
  buildComposePlateCta,
  formatGuestTableLabel,
} from '../../ui/presentation/compose-plate-cta.ts';

describe('formatGuestTableLabel', () => {
  it('numbers tables from the ordered placement list', () => {
    expect(
      formatGuestTableLabel({
        tablePlacementId: 'table_b',
        tablePlacementIds: ['table_a', 'table_b', 'table_c'],
      }),
    ).toBe('Table 2');
  });

  it('returns null when the seat has no matching table', () => {
    expect(
      formatGuestTableLabel({
        tablePlacementId: 'missing',
        tablePlacementIds: ['table_a'],
      }),
    ).toBeNull();
    expect(
      formatGuestTableLabel({
        tablePlacementId: null,
        tablePlacementIds: ['table_a'],
      }),
    ).toBeNull();
  });
});

describe('buildComposePlateCta', () => {
  it('names the destination table when plating is ready', () => {
    const cta = buildComposePlateCta({
      hasTicket: true,
      ingredientCount: 3,
      tableLabel: 'Table 2',
    });
    expect(cta.canPlate).toBe(true);
    expect(cta.label).toBe('Plate · Table 2');
    expect(cta.disabledReason).toBeNull();
  });

  it('explains too-few ingredients inline while keeping the destination label', () => {
    const cta = buildComposePlateCta({
      hasTicket: true,
      ingredientCount: 1,
      tableLabel: 'Table 1',
    });
    expect(cta.canPlate).toBe(false);
    expect(cta.label).toBe('Plate · Table 1');
    expect(cta.disabledReason).toMatch(/Add 2 more/);
    expect(cta.disabledReason).toMatch(/1\/6/);
  });

  it('asks for a ticket when none is selected', () => {
    const cta = buildComposePlateCta({
      hasTicket: false,
      ingredientCount: 3,
    });
    expect(cta.canPlate).toBe(false);
    expect(cta.disabledReason).toMatch(/Select a ticket/i);
  });
});
