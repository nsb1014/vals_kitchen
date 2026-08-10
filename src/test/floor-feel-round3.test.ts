import { describe, expect, it } from 'vitest';
import {
  approachActionsMatch,
  approachInFlightLabel,
  approachIntentReadyToComplete,
  approachIntentStillArmed,
  type ApproachAction,
  type ApproachValidityContext,
  type PendingApproachIntent,
} from '../canvas/world/approach-intent.ts';
import { guestServicePositions } from '../domain/floor/interact.ts';
import { computeFloorInteractHints } from '../canvas/world/floor-feel-hints.ts';
import type { FloorDay, FloorGuest } from '../domain/floor/types.ts';
import type { Placement } from '../domain/state/game-state.ts';

function emptyFloor(overrides: Partial<FloorDay> = {}): FloorDay {
  return {
    pool: [],
    tables: [],
    seats: [],
    tickets: [],
    carriedTicketId: null,
    selectedTicketId: null,
    tutorialStep: null,
    playerPosition: { x: 1, y: 1 },
    ...overrides,
  };
}

function seatedGuest(seat: { x: number; y: number }): FloorGuest {
  return {
    id: 'g1',
    customer: {
      id: 'c1',
      archetypeId: 'casual',
      preference: { primary: {}, avoid: {}, phrases: [] },
    },
    stage: 'seated',
    seat: {
      tablePlacementId: 't1',
      slotIndex: 0,
      x: seat.x,
      y: seat.y,
      facing: 0,
    },
    eatTicksRemaining: 0,
  };
}

function baseCtx(
  overrides: Partial<ApproachValidityContext> = {},
): ApproachValidityContext {
  const seat = { x: 5, y: 5 };
  const guest = seatedGuest(seat);
  const service = guestServicePositions(seat)[0]!;
  return {
    daySeed: 1,
    interactionGeneration: 0,
    floor: emptyFloor({ pool: [guest] }),
    player: { x: 1, y: 1 },
    placements: [],
    canSeatNow: false,
    canRequestSeat: true,
    canOpenCompose: false,
    isMoving: true,
    navDestination: { ...service },
    arrivedAtDestination: false,
    ...overrides,
  };
}

function intent(
  action: ApproachAction,
  destination: { x: number; y: number },
): PendingApproachIntent {
  return {
    revision: 1,
    daySeed: 1,
    interactionGeneration: 0,
    destination,
    action,
  };
}

describe('floor-feel round 3 — approach-and-complete', () => {
  it('keeps an order approach armed while walking to a service cell', () => {
    const seat = { x: 5, y: 5 };
    const service = guestServicePositions(seat)[0]!;
    const guest = seatedGuest(seat);
    const armed = intent(
      { kind: 'order', guestId: guest.id, customerId: guest.customer.id },
      service,
    );
    const ctx = baseCtx({
      floor: emptyFloor({ pool: [guest] }),
      isMoving: true,
      navDestination: service,
      player: { x: 2, y: 2 },
    });
    expect(approachIntentStillArmed(armed, ctx)).toBe(true);
    expect(approachIntentReadyToComplete(armed, ctx)).toBe(false);
  });

  it('auto-completes order only once Val occupies a guest service cell', () => {
    const seat = { x: 5, y: 5 };
    const service = guestServicePositions(seat)[0]!;
    const guest = seatedGuest(seat);
    const armed = intent(
      { kind: 'order', guestId: guest.id, customerId: guest.customer.id },
      service,
    );
    const arrived = baseCtx({
      floor: emptyFloor({ pool: [guest] }),
      player: service,
      isMoving: false,
      navDestination: null,
      arrivedAtDestination: true,
    });
    expect(approachIntentReadyToComplete(armed, arrived)).toBe(true);

    const wrongCell = baseCtx({
      floor: emptyFloor({ pool: [guest] }),
      player: { x: seat.x, y: seat.y - 1 },
      isMoving: false,
      navDestination: null,
      arrivedAtDestination: true,
    });
    // Wrong cell fails adjacency even if a stale destination flag slipped through.
    const wrongIntent = intent(
      { kind: 'order', guestId: guest.id, customerId: guest.customer.id },
      { x: seat.x, y: seat.y - 1 },
    );
    expect(approachIntentReadyToComplete(wrongIntent, wrongCell)).toBe(false);
  });

  it('auto-completes deliver / set / clear with the same arrival gate', () => {
    const seat = { x: 5, y: 5 };
    const service = guestServicePositions(seat)[0]!;
    const guest: FloorGuest = { ...seatedGuest(seat), stage: 'ordered' };
    const deliver = intent(
      {
        kind: 'deliver',
        guestId: guest.id,
        customerId: guest.customer.id,
        ticketId: 'tk1',
      },
      service,
    );
    const deliverFloor = emptyFloor({
      pool: [guest],
      carriedTicketId: 'tk1',
      tickets: [
        {
          id: 'tk1',
          customerId: guest.customer.id,
          status: 'plated',
          ingredientIds: ['tomato'],
        },
      ],
    });
    expect(
      approachIntentReadyToComplete(
        deliver,
        baseCtx({
          floor: deliverFloor,
          player: service,
          isMoving: false,
          navDestination: null,
          arrivedAtDestination: true,
        }),
      ),
    ).toBe(true);

    const placement: Placement = {
      id: 'p1',
      itemKey: 'table_2',
      x: 3,
      y: 3,
      rotation: 0,
    };
    const setIntent = intent({ kind: 'set', placementId: 'p1' }, {
      x: 4,
      y: 3,
    });
    expect(
      approachIntentReadyToComplete(
        setIntent,
        baseCtx({
          floor: emptyFloor({
            tables: [{ placementId: 'p1', state: 'unset', seatSlotCount: 2 }],
          }),
          placements: [placement],
          player: { x: 4, y: 3 },
          isMoving: false,
          navDestination: null,
          arrivedAtDestination: true,
        }),
      ),
    ).toBe(true);

    const clearIntent = intent({ kind: 'clear', placementId: 'p1' }, {
      x: 4,
      y: 3,
    });
    expect(
      approachIntentReadyToComplete(
        clearIntent,
        baseCtx({
          floor: emptyFloor({
            tables: [{ placementId: 'p1', state: 'dirty', seatSlotCount: 2 }],
          }),
          placements: [placement],
          player: { x: 4, y: 3 },
          isMoving: false,
          navDestination: null,
          arrivedAtDestination: true,
        }),
      ),
    ).toBe(true);
  });

  it('cancels stale approaches when the guest/table stage changes', () => {
    const seat = { x: 5, y: 5 };
    const service = guestServicePositions(seat)[0]!;
    const guest = seatedGuest(seat);
    const order = intent(
      { kind: 'order', guestId: guest.id, customerId: guest.customer.id },
      service,
    );
    const orderedGuest: FloorGuest = { ...guest, stage: 'ordered' };
    expect(
      approachIntentStillArmed(
        order,
        baseCtx({
          floor: emptyFloor({ pool: [orderedGuest] }),
          isMoving: true,
          navDestination: service,
        }),
      ),
    ).toBe(false);
  });

  it('matches identical approach actions for retain-on-retap', () => {
    const a: ApproachAction = {
      kind: 'order',
      guestId: 'g1',
      customerId: 'c1',
    };
    const b: ApproachAction = {
      kind: 'order',
      guestId: 'g1',
      customerId: 'c1',
    };
    const c: ApproachAction = {
      kind: 'deliver',
      guestId: 'g1',
      customerId: 'c1',
      ticketId: 't1',
    };
    expect(approachActionsMatch(a, b)).toBe(true);
    expect(approachActionsMatch(a, c)).toBe(false);
    expect(approachInFlightLabel(a)).toBe('order');
    expect(approachInFlightLabel(c)).toBe('deliver');
  });

  it('keeps a sustained preview hint on the pending approach cell', () => {
    const seat = { x: 5, y: 5 };
    const service = guestServicePositions(seat)[0]!;
    const guest = seatedGuest(seat);
    const hints = computeFloorInteractHints({
      floor: emptyFloor({ pool: [guest] }),
      placements: [],
      player: { x: 1, y: 1 },
      grid: {
        w: 10,
        h: 10,
        blocked: new Set([`${seat.x},${seat.y}`]),
      },
      stationNeedsAttention: false,
      pendingApproach: service,
    });
    const preview = hints.find((h) => h.strength === 'preview');
    expect(preview).toEqual({ x: service.x, y: service.y, strength: 'preview' });
  });
});
