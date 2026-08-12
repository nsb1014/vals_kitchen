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
import type { FloorDay, SeatSlot } from '../../domain/floor/types.ts';
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
  /**
   * Sustained preview while an approach-and-complete intent is armed — keeps
   * the pending service cell readable for the whole walk, not just the flash.
   */
  pendingApproach?: GridPoint | null;
  /** True when Val may request seat of the waiting guest. */
  canRequestSeat?: boolean;
}

/**
 * Near hints pulse when Val is already in range; far hints mark the nearest
 * reachable service cell so intent is readable across the room.
 *
 * Guest highlights land on service cells (never under occupied stools) so the
 * floor read stays "stand here", not a glowing ring through the diner.
 * At most one far hint is shown so empty tiles do not light up for every
 * competing chore at once.
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
    pendingApproach,
    canRequestSeat,
  } = ctx;
  const hints: FloorInteractHint[] = [];
  const seen = new Set<string>();
  const orderAvailable = canEnqueue(floor.tickets, 1);
  const farCandidates: Array<{ cell: GridPoint; dist: number }> = [];

  const add = (cell: GridPoint, strength: InteractHintStrength): void => {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    hints.push({ x: cell.x, y: cell.y, strength });
  };

  const proposeFar = (cell: GridPoint): void => {
    const path = findShortestPathToAny(grid, player, [cell]);
    if (!path || path.length < 1) return;
    farCandidates.push({ cell: { ...cell }, dist: path.length - 1 });
  };

  // Pending approach wins over the short flash so one-tap→done stays explicit.
  if (pendingApproach) {
    add(pendingApproach, 'preview');
  } else if (approachPreview) {
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
    if (approach) proposeFar(approach);
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
        add(preferGuestServiceHintCell(player, guest.seat), 'near');
      } else if (guest.stage === 'ordered') {
        const approach = nearestReachableAmong(
          grid,
          player,
          guestServicePositions(guest.seat),
        );
        if (approach) proposeFar(approach);
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
        if (approach) proposeFar(approach);
      }
    }

    for (const guest of floor.pool) {
      if (!guest.seat) continue;
      const near = playerNearGuestSeat(player, guest);
      if (
        guestHintAction(guest.stage, near, 'none', orderAvailable) === 'order'
      ) {
        add(preferGuestServiceHintCell(player, guest.seat), 'near');
      } else if (guest.stage === 'seated' && orderAvailable) {
        const approach = nearestReachableAmong(
          grid,
          player,
          guestServicePositions(guest.seat),
        );
        if (approach) proposeFar(approach);
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
        if (approach) proposeFar(approach);
      }
    }
  }

  // One distant promise at a time — competing far tiles read as noise.
  farCandidates.sort((a, b) => a.dist - b.dist);
  const nearestFar = farCandidates[0];
  if (nearestFar && Number.isFinite(nearestFar.dist)) {
    add(nearestFar.cell, 'far');
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

  let bestFar: { cell: GridPoint; dist: number } | null = null;

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
    if (!approach) continue;
    const path = findShortestPathToAny(grid, player, [approach]);
    if (!path) continue;
    const dist = path.length - 1;
    if (!bestFar || dist < bestFar.dist) {
      bestFar = { cell: approach, dist };
    }
  }
  if (bestFar) add(bestFar.cell, 'far');
  return hints;
}

/** Stand-here cell for a guest interact — never the occupied stool. */
export function preferGuestServiceHintCell(
  player: GridPoint,
  seat: SeatSlot,
): GridPoint {
  const service = guestServicePositions(seat);
  const underfoot = service.find(
    (cell) => cell.x === player.x && cell.y === player.y,
  );
  if (underfoot) return { ...underfoot };

  let best = service[0];
  if (!best) return { x: seat.x, y: seat.y };
  let bestDist =
    Math.abs(best.x - player.x) + Math.abs(best.y - player.y);
  for (let i = 1; i < service.length; i += 1) {
    const cell = service[i]!;
    const dist = Math.abs(cell.x - player.x) + Math.abs(cell.y - player.y);
    if (dist < bestDist) {
      best = cell;
      bestDist = dist;
    }
  }
  return { ...best };
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
