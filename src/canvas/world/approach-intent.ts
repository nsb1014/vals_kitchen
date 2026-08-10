import type { GridPoint } from '../../domain/floor/pathfinding.ts';
import {
  playerNearGuestSeat,
  playerNearPlacement,
} from '../../domain/floor/interact.ts';
import type { FloorDay } from '../../domain/floor/types.ts';
import type { Placement } from '../../domain/state/game-state.ts';
import { canEnqueue } from '../../domain/floor/tickets.ts';

/**
 * Presentation-layer approach intents: walk Val to a legal service cell, then
 * auto-complete the pending action on arrival. Domain proximity rules stay
 * enforced at dispatch time — this only orchestrates one-tap → done.
 */
export type ApproachActionKind =
  | 'seat'
  | 'order'
  | 'deliver'
  | 'set'
  | 'clear'
  | 'compose';

export type ApproachAction =
  | { kind: 'seat'; guestId: string }
  | { kind: 'order'; guestId: string; customerId: string }
  | { kind: 'deliver'; guestId: string; customerId: string; ticketId: string }
  | { kind: 'set'; placementId: string }
  | { kind: 'clear'; placementId: string }
  | { kind: 'compose'; placementId: string };

export interface PendingApproachIntent {
  revision: number;
  daySeed: number;
  interactionGeneration: number;
  destination: GridPoint;
  action: ApproachAction;
}

/** data-in-flight / CTA sync label for an armed approach. */
export function approachInFlightLabel(
  action: ApproachAction,
): ApproachActionKind {
  return action.kind;
}

export function approachActionsMatch(
  a: ApproachAction,
  b: ApproachAction,
): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'seat':
      return a.guestId === (b as Extract<ApproachAction, { kind: 'seat' }>).guestId;
    case 'order':
      return (
        a.guestId === (b as Extract<ApproachAction, { kind: 'order' }>).guestId &&
        a.customerId ===
          (b as Extract<ApproachAction, { kind: 'order' }>).customerId
      );
    case 'deliver':
      return (
        a.guestId ===
          (b as Extract<ApproachAction, { kind: 'deliver' }>).guestId &&
        a.ticketId ===
          (b as Extract<ApproachAction, { kind: 'deliver' }>).ticketId
      );
    case 'set':
    case 'clear':
    case 'compose':
      return (
        a.placementId ===
        (b as Extract<ApproachAction, { kind: 'set' | 'clear' | 'compose' }>)
          .placementId
      );
  }
}

export interface ApproachValidityContext {
  daySeed: number;
  interactionGeneration: number;
  floor: FloorDay;
  player: GridPoint;
  placements: Placement[];
  /** Seat may only dispatch when the domain seat gate is open. */
  canSeatNow: boolean;
  /** Seat approach stays armed only while the request gate remains open. */
  canRequestSeat: boolean;
  /** Compose may only open when the domain compose gate is open. */
  canOpenCompose: boolean;
  /** When still walking, destination must match the armed cell. */
  isMoving: boolean;
  navDestination: GridPoint | null;
  /** World-center snap check when idle (presentation arrival fidelity). */
  arrivedAtDestination: boolean;
}

/**
 * True while the armed approach still describes a live, completable action.
 * Does not require adjacency until arrival — en-route intents stay valid.
 */
export function approachIntentStillArmed(
  intent: PendingApproachIntent,
  ctx: ApproachValidityContext,
): boolean {
  if (intent.daySeed !== ctx.daySeed) return false;
  if (intent.interactionGeneration !== ctx.interactionGeneration) return false;
  if (!destinationStillTargeted(intent.destination, ctx)) return false;
  return approachActionStillPossible(intent.action, ctx, 'enroute');
}

/**
 * True when Val has arrived and the domain proximity / stage gates allow the
 * pending dispatch. Call only when idle at the destination.
 */
export function approachIntentReadyToComplete(
  intent: PendingApproachIntent,
  ctx: ApproachValidityContext,
): boolean {
  if (ctx.isMoving) return false;
  if (!approachIntentStillArmed(intent, ctx)) return false;
  if (!ctx.arrivedAtDestination) return false;
  return approachActionStillPossible(intent.action, ctx, 'complete');
}

function destinationStillTargeted(
  destination: GridPoint,
  ctx: ApproachValidityContext,
): boolean {
  if (ctx.isMoving) {
    return Boolean(
      ctx.navDestination &&
        ctx.navDestination.x === destination.x &&
        ctx.navDestination.y === destination.y,
    );
  }
  return (
    ctx.player.x === destination.x &&
    ctx.player.y === destination.y &&
    ctx.arrivedAtDestination
  );
}

function approachActionStillPossible(
  action: ApproachAction,
  ctx: ApproachValidityContext,
  phase: 'enroute' | 'complete',
): boolean {
  const { floor, player, placements } = ctx;
  switch (action.kind) {
    case 'seat': {
      const waiting = floor.pool.some(
        (guest) => guest.id === action.guestId && guest.stage === 'waiting',
      );
      if (!waiting) return false;
      if (!ctx.canRequestSeat) return false;
      // En-route: request gate only. Complete: physical seat gate (adjacency).
      return phase === 'enroute' ? true : ctx.canSeatNow;
    }
    case 'order': {
      const guest = floor.pool.find((g) => g.id === action.guestId);
      if (
        !guest ||
        guest.stage !== 'seated' ||
        guest.customer.id !== action.customerId
      ) {
        return false;
      }
      if (floor.carriedTicketId) return false;
      if (!canEnqueue(floor.tickets, 1)) return false;
      if (phase === 'complete' && !playerNearGuestSeat(player, guest)) {
        return false;
      }
      return true;
    }
    case 'deliver': {
      const guest = floor.pool.find((g) => g.id === action.guestId);
      const ticket = floor.tickets.find((t) => t.id === action.ticketId);
      if (
        !guest ||
        guest.stage !== 'ordered' ||
        guest.customer.id !== action.customerId
      ) {
        return false;
      }
      if (
        !ticket ||
        ticket.status !== 'plated' ||
        floor.carriedTicketId !== ticket.id ||
        ticket.customerId !== action.customerId
      ) {
        return false;
      }
      if (phase === 'complete' && !playerNearGuestSeat(player, guest)) {
        return false;
      }
      return true;
    }
    case 'set':
    case 'clear': {
      const table = floor.tables.find(
        (t) => t.placementId === action.placementId,
      );
      const placement = placements.find((p) => p.id === action.placementId);
      if (!table || !placement) return false;
      if (action.kind === 'set' && table.state !== 'unset') return false;
      if (action.kind === 'clear' && table.state !== 'dirty') return false;
      if (phase === 'complete' && !playerNearPlacement(player, placement)) {
        return false;
      }
      return true;
    }
    case 'compose': {
      const placement = placements.find((p) => p.id === action.placementId);
      if (!placement) return false;
      if (floor.carriedTicketId) {
        const carried = floor.tickets.find(
          (t) => t.id === floor.carriedTicketId && t.status === 'plated',
        );
        if (carried) return false;
      }
      if (!floor.tickets.some((t) => t.status === 'open')) return false;
      if (phase === 'complete') {
        if (!playerNearPlacement(player, placement)) return false;
        if (!ctx.canOpenCompose) return false;
      }
      return true;
    }
  }
}
