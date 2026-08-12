import { describe, expect, it } from 'vitest';
import {
  cameraLeadOffset,
  computeFloorInteractHints,
} from '../canvas/world/floor-feel-hints.ts';
import { guestServicePositions } from '../domain/floor/interact.ts';
import type { FloorDay, FloorGuest } from '../domain/floor/types.ts';
import type { Placement } from '../domain/state/game-state.ts';
import { TILE_PX } from '../canvas/coordinates.ts';
import {
  mapReducerEventsToUi,
  sfxForFloorFeelBeat,
} from '../store/service-events.ts';
import { createNewGameState } from '../domain/state/game-state.ts';
import { waitingGuestWorldPosition } from '../canvas/world/waiting-line.ts';
import { STARTER_DOOR } from '../domain/floor/starter-map.ts';

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

describe('floor-feel distant intent hints', () => {
  it('paints a far service-cell hint when an order is available but Val is remote', () => {
    const seat = { x: 5, y: 5 };
    const guest = seatedGuest(seat);
    const floor = emptyFloor({ pool: [guest] });
    const blocked = new Set<string>([`${seat.x},${seat.y}`]);
    const hints = computeFloorInteractHints({
      floor,
      placements: [],
      player: { x: 1, y: 1 },
      grid: { w: 10, h: 10, blocked },
      stationNeedsAttention: false,
    });
    expect(hints.some((h) => h.strength === 'far')).toBe(true);
    const far = hints.find((h) => h.strength === 'far')!;
    const service = guestServicePositions(seat);
    expect(service.some((c) => c.x === far.x && c.y === far.y)).toBe(true);
  });

  it('uses near strength on a service cell when Val already stands beside the guest', () => {
    const seat = { x: 5, y: 5 };
    const guest = seatedGuest(seat);
    const service = guestServicePositions(seat)[0]!;
    const floor = emptyFloor({ pool: [guest] });
    const hints = computeFloorInteractHints({
      floor,
      placements: [],
      player: service,
      grid: { w: 10, h: 10, blocked: new Set([`${seat.x},${seat.y}`]) },
      stationNeedsAttention: false,
    });
    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          x: service.x,
          y: service.y,
          strength: 'near',
        }),
      ]),
    );
    expect(hints.some((h) => h.x === seat.x && h.y === seat.y)).toBe(false);
  });

  it('shows at most one far hint when several chores compete', () => {
    const seat = { x: 5, y: 5 };
    const guest = seatedGuest(seat);
    const placement: Placement = {
      id: 'table_1',
      itemKey: 'table_2',
      x: 8,
      y: 8,
      rotation: 0,
    };
    const floor = emptyFloor({
      pool: [guest],
      tables: [
        {
          placementId: 'table_1',
          state: 'unset',
          seatSlotCount: 2,
        },
      ],
    });
    const hints = computeFloorInteractHints({
      floor,
      placements: [placement],
      player: { x: 1, y: 1 },
      grid: {
        w: 12,
        h: 12,
        blocked: new Set([`${seat.x},${seat.y}`, '8,8']),
      },
      stationNeedsAttention: true,
    });
    expect(hints.filter((h) => h.strength === 'far')).toHaveLength(1);
  });

  it('marks unset tables with a far approach cell from across the room', () => {
    const placement: Placement = {
      id: 'table_1',
      itemKey: 'table_2',
      x: 6,
      y: 4,
      rotation: 0,
    };
    const floor = emptyFloor({
      tables: [
        {
          placementId: 'table_1',
          state: 'unset',
          seatSlotCount: 2,
        },
      ],
    });
    const blocked = new Set<string>(['6,4']);
    const hints = computeFloorInteractHints({
      floor,
      placements: [placement],
      player: { x: 1, y: 1 },
      grid: { w: 10, h: 10, blocked },
      stationNeedsAttention: false,
    });
    expect(hints.some((h) => h.strength === 'far')).toBe(true);
  });
});

describe('floor-feel camera lead', () => {
  it('offsets follow target forward while moving', () => {
    expect(cameraLeadOffset(0, true, 0.75, TILE_PX)).toEqual({
      x: TILE_PX * 0.75,
      y: 0,
    });
    expect(cameraLeadOffset(1, false, 0.75, TILE_PX)).toEqual({ x: 0, y: 0 });
  });
});

describe('floor-feel waiting-line staging geometry', () => {
  it('keeps queued silhouette slots distinct from the head wait cell', () => {
    const head = waitingGuestWorldPosition(STARTER_DOOR, 0);
    const queued = waitingGuestWorldPosition(STARTER_DOOR, 1);
    expect(queued.x).not.toBe(head.x);
    expect(queued.y).toBe(head.y);
  });
});

describe('floor-feel service-events SFX wiring', () => {
  it('maps deliver to the shipped serve sting and flags CUSTOMER_SERVED', () => {
    expect(sfxForFloorFeelBeat('deliver')).toBe('serve');
    expect(sfxForFloorFeelBeat('seat')).toBe('placement');
    expect(sfxForFloorFeelBeat('order')).toBe('purchase');
    expect(sfxForFloorFeelBeat('walk')).toBe('uiClick');
    const patch = mapReducerEventsToUi(
      [
        {
          type: 'CUSTOMER_SERVED',
          customerId: 'c1',
          matchStars: 8,
          tip: 10,
          ratingDelta: 0.1,
          recipeName: 'Soup',
        },
      ],
      createNewGameState(1),
    );
    expect(patch.playDeliverSting).toBe(true);
    expect(patch.pendingReview).toBeTruthy();
  });
});
