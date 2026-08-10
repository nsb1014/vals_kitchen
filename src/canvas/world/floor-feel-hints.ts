import {
  findShortestPathToAny,
  type GridPoint,
} from '../../domain/floor/pathfinding.ts';
import {
  guestServicePositions,
  isAdjacent,
  isCookStationItemKey,
  playerNearGuestSeat,
  playerNearPlacement,
  waitingGuestServicePositions,
} from '../../domain/floor/interact.ts';
import type { FloorDay } from '../../domain/floor/types.ts';
import type { Placement } from '../../domain/state/game-state.ts';
import { canEnqueue } from '../../domain/floor/tickets.ts';
import { guestHintAction } from './guest-interaction-hint.ts';

export type InteractHintStrength = 'near' | 'far' | 'preview';

export interface FloorInteractHint {
  x: number;
  y: number;
  strength: InteractHintStrength;
}

export interface FloorFeelHintContext {
  floor: FloorDay;
  placements: Placement[];
  player: GridPoint;
  grid: { w: number; h: number; blocked: ReadonlySet<string> };
  stationNeedsAttention: boolean;
  /** Brief flash after choosing a remote service cell (opp #9). */
  approachPreview?: GridPoint | null;
  /** True when Val may request seat of the waiting guest. */
  canRequestSeat?: boolean;
}

/**
 * Near hints pulse when Val is already in range; far hints mark the nearest
 * reachable service cell so intent is readable across the room.
 */
export function computeFloorInteractHints(
  ctx: FloorFeelHintContext,
): FloorInteractHint[] {
  const {
    floor,
    placements,
    player,
    grid,
    stationNeedsAttention,
    approachPreview,
    canRequestSeat,
  } = ctx;
  const hints: FloorInteractHint[] = [];
  const seen = new Set<string>();
  const orderAvailable = canEnqueue(floor.tickets, 1);

  const add = (cell: GridPoint, strength: InteractHintStrength): void => {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    hints.push({ x: cell.x, y: cell.y, strength });
  };

  if (approachPreview) {
    add(approachPreview, 'preview');
  }

  const placementById = new Map(placements.map((p) => [p.id, p]));

  for (const table of floor.tables) {
    if (table.state !== 'unset' && table.state !== 'dirty') continue;
    const placement = placementById.get(table.placementId);
    if (!placement) continue;

    const tableAdjacent =
      playerNearPlacement(player, placement) ||
      floor.seats
        .filter((seat) => seat.tablePlacementId === table.placementId)
        .some((seat) => isAdjacent(player, seat));

    if (tableAdjacent) {
      add({ x: placement.x, y: placement.y }, 'near');
      continue;
    }

    const approach = nearestReachableAmong(
      grid,
      player,
      adjacentWalkCandidates(placement),
    );
    if (approach) add(approach, 'far');
  }

  const carriedTicket = floor.tickets.find(
    (ticket) =>
      ticket.id === floor.carriedTicketId && ticket.status === 'plated',
  );

  if (carriedTicket) {
    const guest = floor.pool.find(
      (candidate) => candidate.customer.id === carriedTicket.customerId,
    );
    if (guest?.seat) {
      const near = playerNearGuestSeat(player, guest);
      if (
        guestHintAction(guest.stage, near, 'matching', orderAvailable) ===
        'deliver'
      ) {
        add({ x: guest.seat.x, y: guest.seat.y }, 'near');
      } else if (guest.stage === 'ordered') {
        const approach = nearestReachableAmong(
          grid,
          player,
          guestServicePositions(guest.seat),
        );
        if (approach) add(approach, 'far');
      }
    }
  } else {
    if (stationNeedsAttention) {
      for (const placement of placements) {
        if (!isCookStationItemKey(placement.itemKey)) continue;
        if (playerNearPlacement(player, placement)) {
          add({ x: placement.x, y: placement.y }, 'near');
          continue;
        }
        const approach = nearestReachableAmong(
          grid,
          player,
          adjacentWalkCandidates(placement),
        );
        if (approach) add(approach, 'far');
      }
    }

    for (const guest of floor.pool) {
      if (!guest.seat) continue;
      const near = playerNearGuestSeat(player, guest);
      if (
        guestHintAction(guest.stage, near, 'none', orderAvailable) === 'order'
      ) {
        add({ x: guest.seat.x, y: guest.seat.y }, 'near');
      } else if (guest.stage === 'seated' && orderAvailable) {
        const approach = nearestReachableAmong(
          grid,
          player,
          guestServicePositions(guest.seat),
        );
        if (approach) add(approach, 'far');
      }
    }
  }

  if (canRequestSeat) {
    const waiting = floor.pool.find((guest) => guest.stage === 'waiting');
    if (waiting) {
      const destinations = waitingGuestServicePositions(grid.w, grid.h);
      const standingOnService = destinations.some(
        (cell) => cell.x === player.x && cell.y === player.y,
      );
      if (standingOnService) {
        for (const cell of destinations) {
          if (cell.x === player.x && cell.y === player.y) {
            add(cell, 'near');
          }
        }
      } else {
        const approach = nearestReachableAmong(grid, player, destinations);
        if (approach) add(approach, 'far');
      }
    }
  }

  return hints;
}

export function computeStationInteractHints(
  placements: Placement[],
  player: GridPoint,
  grid: { w: number; h: number; blocked: ReadonlySet<string> },
  stationNeedsAttention: boolean,
): FloorInteractHint[] {
  if (!stationNeedsAttention) return [];
  const hints: FloorInteractHint[] = [];
  const seen = new Set<string>();
  const add = (cell: GridPoint, strength: InteractHintStrength): void => {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    hints.push({ x: cell.x, y: cell.y, strength });
  };

  for (const placement of placements) {
    if (!isCookStationItemKey(placement.itemKey)) continue;
    if (playerNearPlacement(player, placement)) {
      add({ x: placement.x, y: placement.y }, 'near');
      continue;
    }
    const approach = nearestReachableAmong(
      grid,
      player,
      adjacentWalkCandidates(placement),
    );
    if (approach) add(approach, 'far');
  }
  return hints;
}

function adjacentWalkCandidates(placement: Placement): GridPoint[] {
  const destinations: GridPoint[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      destinations.push({ x: placement.x + dx, y: placement.y + dy });
    }
  }
  return destinations;
}

function nearestReachableAmong(
  grid: { w: number; h: number; blocked: ReadonlySet<string> },
  start: GridPoint,
  destinations: GridPoint[],
): GridPoint | null {
  const path = findShortestPathToAny(grid, start, destinations);
  const end = path?.[path.length - 1];
  return end ? { ...end } : null;
}

/** Camera lead offset in world pixels while Val is walking. */
export function cameraLeadOffset(
  facing: 0 | 1 | 2 | 3,
  isMoving: boolean,
  leadTiles = 0.75,
  tilePx: number,
): { x: number; y: number } {
  if (!isMoving || leadTiles <= 0) return { x: 0, y: 0 };
  const lead = tilePx * leadTiles;
  switch (facing) {
    case 0:
      return { x: lead, y: 0 };
    case 1:
      return { x: 0, y: lead };
    case 2:
      return { x: 0, y: -lead };
    case 3:
      return { x: -lead, y: 0 };
  }
}
