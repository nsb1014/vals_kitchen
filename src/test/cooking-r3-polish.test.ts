import { describe, expect, it } from 'vitest';
import { emptyFlavorProfile } from '../domain/flavor/axis-labels.ts';
import {
  buildComposeProgress,
  composeProgressMeterHtml,
} from '../ui/presentation/compose-progress.ts';
import {
  FLOOR_CTA_MIN_IN_FLIGHT_MS,
  floorActionIconHtml,
  renderFloorActionLabelHtml,
  resolveFloorCtaInFlight,
} from '../ui/presentation/floor-action-feedback.ts';
import {
  formatFloorTicketLabel,
  renderFloorTicketOrderCuesHtml,
} from '../ui/presentation/floor-ticket.ts';
import type { FloorTicket } from '../domain/floor/types.ts';
import type { Customer } from '../domain/day/types.ts';

describe('compose progress feedback', () => {
  it('tracks the 3–6 plating window and live request coherence', () => {
    const empty = buildComposeProgress({
      ingredientCount: 0,
      requestedBands: { UM: 'high', SA: 'low' },
      profile: null,
    });
    expect(empty.statusKind).toBe('empty');
    expect(empty.statusHint).toMatch(/3–6/);
    expect(empty.windowFillPct).toBe(0);
    expect(empty.coherenceLabel).toMatch(/0 \/ 2/);

    const building = buildComposeProgress({
      ingredientCount: 2,
      requestedBands: { UM: 'high', SA: 'low' },
      profile: { ...emptyFlavorProfile(), UM: 2, SA: 1 },
    });
    expect(building.statusKind).toBe('building');
    expect(building.statusHint).toMatch(/Add 1 more/);
    expect(building.windowFillPct).toBeGreaterThan(50);
    expect(building.coherenceInRange).toBe(1);
    expect(building.coherenceKind).toBe('partial');

    const ready = buildComposeProgress({
      ingredientCount: 3,
      requestedBands: { UM: 'high', SA: 'low' },
      profile: { ...emptyFlavorProfile(), UM: 8, SA: 1 },
    });
    expect(ready.statusKind).toBe('ready');
    expect(ready.coherenceKind).toBe('matched');
    expect(ready.coherenceLabel).toMatch(/All 2/);

    const html = composeProgressMeterHtml(ready, (text) => text);
    expect(html).toContain('data-testid="compose-progress"');
    expect(html).toContain('data-status="ready"');
    expect(html).toContain('data-coherence="matched"');
  });
});

describe('floor CTA in-flight feedback', () => {
  it('keeps instant CTAs in-flight until the min hold elapses', () => {
    const duringHold = resolveFloorCtaInFlight({
      action: 'set-table',
      pendingAction: 'set-table',
      seatingInFlight: false,
      seatActionSawSeating: false,
      canvasBeat: null,
      actionCompleted: true,
      minHoldElapsed: false,
    });
    expect(duringHold.inFlight).toBe(true);
    expect(duringHold.clearPending).toBe(false);

    const afterHold = resolveFloorCtaInFlight({
      action: 'set-table',
      pendingAction: 'set-table',
      seatingInFlight: false,
      seatActionSawSeating: false,
      canvasBeat: null,
      actionCompleted: true,
      minHoldElapsed: true,
    });
    expect(afterHold.inFlight).toBe(false);
    expect(afterHold.clearPending).toBe(true);
    expect(FLOOR_CTA_MIN_IN_FLIGHT_MS).toBeGreaterThanOrEqual(480);
  });

  it('holds seat through canvas walk/seat beats and seating stage', () => {
    const walking = resolveFloorCtaInFlight({
      action: 'seat',
      pendingAction: 'seat',
      seatingInFlight: false,
      seatActionSawSeating: false,
      canvasBeat: 'walk',
      actionCompleted: false,
      minHoldElapsed: true,
    });
    expect(walking.inFlight).toBe(true);
    expect(walking.clearPending).toBe(false);

    const seating = resolveFloorCtaInFlight({
      action: 'seat',
      pendingAction: 'seat',
      seatingInFlight: true,
      seatActionSawSeating: false,
      canvasBeat: 'seat',
      actionCompleted: false,
      minHoldElapsed: true,
    });
    expect(seating.inFlight).toBe(true);
    expect(seating.sawSeating).toBe(true);

    const done = resolveFloorCtaInFlight({
      action: 'seat',
      pendingAction: 'seat',
      seatingInFlight: false,
      seatActionSawSeating: true,
      canvasBeat: null,
      actionCompleted: false,
      minHoldElapsed: true,
    });
    expect(done.clearPending).toBe(true);
  });

  it('renders icon + label markup for primary CTAs', () => {
    expect(floorActionIconHtml('set-table')).toContain('floor-action-icon');
    expect(renderFloorActionLabelHtml('take-orders', 'Take orders')).toContain(
      'floor-action-label',
    );
    expect(renderFloorActionLabelHtml('deliver', 'Deliver')).toContain(
      'floor-action-icon',
    );
  });
});

describe('order tab icon-first cues', () => {
  const ticket: FloorTicket = {
    id: 'ticket_customer_1_0',
    customerId: 'customer_1_0',
    ingredientIds: [],
    status: 'open',
  };
  const customer: Customer = {
    id: 'customer_1_0',
    archetypeId: 'comfort_seeker',
    preference: {
      primary: { UM: 'high', RI: 'mid' },
      avoid: { SA: true },
      phrases: ['high Umami', 'moderate Rich', 'low Salty'],
      idealProfile: {
        SW: 1,
        SA: 4,
        SO: 1,
        BI: 0,
        UM: 8,
        HE: 0,
        FR: 0,
        EA: 2,
        SM: 1,
        PU: 2,
        NU: 1,
        RI: 5,
        LI: 2,
        HT: 0,
        CR: 1,
        TE: 1,
      },
    },
  };

  it('exposes axis cues for Order-tab scannability while keeping full prose', () => {
    const label = formatFloorTicketLabel({
      ticket,
      customer,
      archetypeName: 'Comfort Seeker',
      selected: false,
    });
    expect(label.preferenceCues.length).toBeGreaterThan(0);
    expect(label.preferenceCues.map((cue) => cue.axis)).toEqual(
      expect.arrayContaining(['UM', 'RI']),
    );
    expect(label.preferenceFull).toMatch(/Umami/i);
    const html = renderFloorTicketOrderCuesHtml(label.preferenceCues, (t) => t);
    expect(html).toContain('data-testid="floor-tickets-order-cue"');
    expect(html).toContain('data-axis="UM"');
    expect(html).toContain('floor-tickets-order-cue-short');
    expect(html).toContain('>Um<');
    expect(html).not.toContain('floor-tickets-phrase-chip');
  });
});
