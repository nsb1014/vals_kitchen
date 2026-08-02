import {
  EQUIPMENT_IDS,
  NEW_GAME_STARTER_IDS,
  STARTING_EQUIPMENT_IDS,
} from '../types.ts';
import type { ActiveDay } from '../day/types.ts';
import type { RecipeMasteryMap } from '../floor/mastery.ts';
import {
  createStarterMap,
  isDiningCell,
  isKitchenCell,
  isPerimeterWallCell,
  mainGuestEntranceReservedCells,
  mapZonesForGrid,
} from '../floor/starter-map.ts';
import { seatsFromPlacements } from '../floor/seats.ts';
import {
  isWalkBlockingPlacement,
  keepsGuestServiceReachable,
  recoverMainFloorPlayerPosition,
} from '../floor/service-access.ts';
import { createRng } from '../rng/index.ts';
import {
  createEmptyDecorPurchasedCounts,
  isDecorItemKey,
  normalizeDecorPurchasedCounts,
  type DecorPurchasedCounts,
} from '../economy/decor.ts';
import type { AchievementId } from '../achievements/catalog.ts';

export const STARTING_GRID = { w: 4, h: 4 } as const;
export const STARTING_CASH = 500;
export const SOFT_RESET_CASH = 100;
export const MIN_DISH_INGREDIENTS = 3;
export const MAX_DISH_INGREDIENTS = 6;
export const TABLE_SEATS = 2;
export const MAX_GRID_SIZE = 12;
export const RECIPE_BONUS_STARS = 0.75;
/** Save v5: unlocked achievement ids are persisted. */
export const CURRENT_SAVE_VERSION = 5 as const;

export interface Placement {
  id: string;
  itemKey: string;
  x: number;
  y: number;
  rotation: number;
}

export interface GameStats {
  totalCustomersServed: number;
  totalEarnings: number;
  prestigesTotal: number;
}

export interface GameState {
  saveVersion: typeof CURRENT_SAVE_VERSION;
  globalRunSeed: number;
  day: number;
  cash: number;
  prestige: number;
  rating: number;
  unlockedIngredientIds: string[];
  purchasedEquipmentIds: string[];
  discoveredRecipeIds: string[];
  recipeMastery: RecipeMasteryMap;
  unlockedAchievementIds: AchievementId[];
  gridSize: { w: number; h: number };
  /** Furniture on the main dining + kitchen floor. */
  placements: Placement[];
  /** Stations on the unlocked back-kitchen room (same grid dimensions). */
  backKitchenPlacements: Placement[];
  seatingCapacity: number;
  tableCount: number;
  /** Lifetime-per-run ownership used for placement availability and achievements. */
  decorPurchasedCounts: DecorPurchasedCounts;
  gridExpansionCount: number;
  /** One-time unlock: separate back-kitchen room + connecting door. */
  kitchenAnnexOwned: boolean;
  ingredientUnlockIndex: number;
  activeDay: ActiveDay | null;
  /** Legacy serial-service draft. Floor service stores drafts on open tickets. */
  composeDraftIngredientIds?: string[];
  stats: GameStats;
}

let placementCounter = 0;
const EQUIPMENT_ITEM_KEYS = new Set<string>(EQUIPMENT_IDS);

export function nextPlacementId(): string {
  placementCounter += 1;
  return `placement_${placementCounter}`;
}

export function createDefaultPlacements(): Placement[] {
  return createStarterMap().placements.map((p) => ({ ...p }));
}

export function seatingFromTableCount(tableCount: number): number {
  return tableCount * TABLE_SEATS;
}

export function seatingFromPlacements(placements: Placement[]): number {
  return seatsFromPlacements(placements).length;
}

function placementCells(placement: Placement): { x: number; y: number }[] {
  return placement.itemKey.startsWith('table')
    ? [placement, ...seatsFromPlacements([placement])]
    : [placement];
}

/**
 * Move legacy furniture out of the reserved main entrance corridor. Unaffected
 * furniture stays exactly where the player put it; affected items are scanned
 * into the first legal row-major cell, or omitted when the room has no legal
 * footprint so their separately tracked ownership remains available to place.
 */
export function normalizeMainFloorPlacements(
  gridSize: { w: number; h: number },
  placements: Placement[],
  kitchenAnnexOwned = false,
): Placement[] {
  const { w, h } = gridSize;
  const zones = mapZonesForGrid(w, h);
  const reserved = new Set(
    mainGuestEntranceReservedCells(w, h).map((cell) => `${cell.x},${cell.y}`),
  );
  const conflictsEntrance = (placement: Placement): boolean =>
    placementCells(placement).some((cell) => reserved.has(`${cell.x},${cell.y}`));
  const fixed = placements.filter((placement) => !conflictsEntrance(placement));
  const relocated: Placement[] = [];
  const occupied = new Set(
    fixed.flatMap(placementCells).map((cell) => `${cell.x},${cell.y}`),
  );

  const legalCandidate = (placement: Placement): boolean => {
    const cells = placementCells(placement);
    for (const cell of cells) {
      if (cell.x < 0 || cell.y < 0 || cell.x >= w || cell.y >= h) return false;
      if (isPerimeterWallCell(cell.x, cell.y, w, h)) return false;
      if (reserved.has(`${cell.x},${cell.y}`)) return false;
      if (occupied.has(`${cell.x},${cell.y}`)) return false;
    }
    if (placement.itemKey.startsWith('table')) {
      return cells.every((cell) => isDiningCell(zones, cell.x, cell.y));
    }
    if (isDecorItemKey(placement.itemKey)) {
      return isDiningCell(zones, placement.x, placement.y);
    }
    if (EQUIPMENT_ITEM_KEYS.has(placement.itemKey)) {
      return isKitchenCell(zones, placement.x, placement.y);
    }
    return true;
  };

  for (const placement of placements) {
    if (!conflictsEntrance(placement)) continue;
    let next: Placement | undefined;
    for (let y = 1; y < h - 1 && !next; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const candidate = { ...placement, x, y };
        if (legalCandidate(candidate)) {
          next = candidate;
          break;
        }
      }
    }
    if (!next) continue;
    relocated.push(next);
    for (const cell of placementCells(next)) {
      occupied.add(`${cell.x},${cell.y}`);
    }
  }

  const byId = new Map([...fixed, ...relocated].map((placement) => [placement.id, placement]));
  const entranceSafe = placements.flatMap((placement) => {
    const normalized = byId.get(placement.id);
    return normalized ? [normalized] : [];
  });
  if (keepsGuestServiceReachable(gridSize, entranceSafe, kitchenAnnexOwned)) {
    return entranceSafe;
  }

  // Saves created before service positions were part of placement validation
  // can contain collision-free furniture that nevertheless strands a stool.
  // Search the complete blocker layout so an early greedy relocation cannot
  // silently force a later owned table back into inventory.
  const candidatesFor = (placement: Placement): Placement[] => {
    const candidates: Placement[] = [placement];
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        if (x === placement.x && y === placement.y) continue;
        candidates.push({ ...placement, x, y });
      }
    }
    return candidates;
  };
  const staticLegal = (candidate: Placement): boolean => {
    const cells = placementCells(candidate);
    for (const cell of cells) {
      if (cell.x < 0 || cell.y < 0 || cell.x >= w || cell.y >= h) return false;
      if (isPerimeterWallCell(cell.x, cell.y, w, h)) return false;
      if (reserved.has(`${cell.x},${cell.y}`)) return false;
    }
    if (candidate.itemKey.startsWith('table')) {
      if (!cells.every((cell) => isDiningCell(zones, cell.x, cell.y))) return false;
    } else if (isDecorItemKey(candidate.itemKey)) {
      if (!isDiningCell(zones, candidate.x, candidate.y)) return false;
    } else if (EQUIPMENT_ITEM_KEYS.has(candidate.itemKey)) {
      if (!isKitchenCell(zones, candidate.x, candidate.y)) return false;
    }
    return true;
  };
  const blockers = entranceSafe.filter(isWalkBlockingPlacement);
  const passive = entranceSafe.filter(
    (placement) => !isWalkBlockingPlacement(placement),
  );
  const failed = new Set<string>();
  // Save loading is synchronous. Bound combinatorial legacy repair so a dense,
  // historically valid but newly infeasible floor cannot freeze startup.
  // The deterministic salvage below retains omitted furniture as owned inventory.
  const MAX_SERVICE_REPAIR_STATES = 1_000;
  let serviceRepairStates = 0;

  const placePassive = (
    blockerLayout: Placement[],
    blockerOccupied: ReadonlySet<string>,
  ): Placement[] | null => {
    const searchPassive = (
      index: number,
      placed: Placement[],
      occupiedCells: Set<string>,
    ): Placement[] | null => {
      if (index === passive.length) return placed;
      const placement = passive[index]!;
      for (const candidate of candidatesFor(placement)) {
        if (!staticLegal(candidate)) continue;
        const cells = placementCells(candidate);
        if (cells.some((cell) => occupiedCells.has(`${cell.x},${cell.y}`))) continue;
        const nextOccupied = new Set(occupiedCells);
        for (const cell of cells) nextOccupied.add(`${cell.x},${cell.y}`);
        const result = searchPassive(
          index + 1,
          [...placed, candidate],
          nextOccupied,
        );
        if (result) return result;
      }
      return null;
    };
    return searchPassive(0, [...blockerLayout], new Set(blockerOccupied));
  };

  const search = (
    index: number,
    placed: Placement[],
    occupiedCells: Set<string>,
  ): Placement[] | null => {
    serviceRepairStates += 1;
    if (serviceRepairStates > MAX_SERVICE_REPAIR_STATES) return null;
    if (index === blockers.length) {
      return placePassive(placed, occupiedCells);
    }
    const memoKey = `${index}|${placed
      .map((item) => `${item.itemKey}@${item.x},${item.y}`)
      .join(';')}`;
    if (failed.has(memoKey)) return null;
    const placement = blockers[index]!;
    for (const candidate of candidatesFor(placement)) {
      if (!staticLegal(candidate)) continue;
      const cells = placementCells(candidate);
      if (cells.some((cell) => occupiedCells.has(`${cell.x},${cell.y}`))) continue;
      const nextPlaced = [...placed, candidate];
      if (!keepsGuestServiceReachable(gridSize, nextPlaced, kitchenAnnexOwned)) continue;
      const nextOccupied = new Set(occupiedCells);
      for (const cell of cells) nextOccupied.add(`${cell.x},${cell.y}`);
      const result = search(index + 1, nextPlaced, nextOccupied);
      if (result) return result;
    }
    failed.add(memoKey);
    return null;
  };

  const fullRepair = search(0, [], new Set());
  if (fullRepair) {
    const repairedById = new Map(fullRepair.map((placement) => [placement.id, placement]));
    return entranceSafe.map((placement) => repairedById.get(placement.id)!);
  }

  // No arrangement can preserve the complete set. Keep the longest legal
  // prefix; omitted ownership remains available in edit mode for manual placement.
  const salvage: Placement[] = [];
  const salvageOccupied = new Set<string>();
  for (const placement of entranceSafe) {
    const next = candidatesFor(placement).find((candidate) => {
      if (!staticLegal(candidate)) return false;
      const cells = placementCells(candidate);
      if (cells.some((cell) => salvageOccupied.has(`${cell.x},${cell.y}`))) return false;
      return keepsGuestServiceReachable(
        gridSize,
        [...salvage, candidate],
        kitchenAnnexOwned,
      );
    });
    if (!next) continue;
    salvage.push(next);
    for (const cell of placementCells(next)) salvageOccupied.add(`${cell.x},${cell.y}`);
  }
  return salvage;
}

/**
 * Migrate saves that widened the main floor by +2 annex columns into the
 * same-size back-kitchen room model. Idempotent when backKitchenPlacements exists
 * and width no longer carries the annex bonus.
 */
export function migrateAnnexWidthToBackRoom(raw: {
  kitchenAnnexOwned?: boolean;
  gridSize?: { w: number; h: number };
  placements?: Placement[];
  backKitchenPlacements?: Placement[];
}): {
  gridSize: { w: number; h: number };
  placements: Placement[];
  backKitchenPlacements: Placement[];
} {
  const starter = createStarterMap();
  const kitchenAnnexOwned = Boolean(raw.kitchenAnnexOwned);
  let gridSize = { ...(raw.gridSize ?? starter.gridSize) };
  let placements = (raw.placements ?? starter.placements).map((p) => ({ ...p }));
  let backKitchenPlacements = (raw.backKitchenPlacements ?? []).map((p) => ({ ...p }));

  const hadSeparateRoomField = raw.backKitchenPlacements !== undefined;
  if (kitchenAnnexOwned && !hadSeparateRoomField) {
    // Width-annex era always added +2 columns once.
    const reclaim = 2;
    const newW = Math.min(MAX_GRID_SIZE, Math.max(starter.gridSize.w, gridSize.w - reclaim));
    if (newW < gridSize.w) {
      const stay: Placement[] = [];
      const moved: Placement[] = [];
      for (const p of placements) {
        if (p.x >= newW - 1) {
          moved.push(p);
        } else {
          stay.push(p);
        }
      }
      placements = stay;
      gridSize = { ...gridSize, w: newW };
      const occupied = new Set(backKitchenPlacements.map((p) => `${p.x},${p.y}`));
      let cursorY = 1;
      let cursorX = 1;
      for (const p of moved) {
        while (
          isPerimeterWallCell(cursorX, cursorY, gridSize.w, gridSize.h) ||
          occupied.has(`${cursorX},${cursorY}`)
        ) {
          cursorY += 1;
          if (cursorY >= gridSize.h - 1) {
            cursorY = 1;
            cursorX += 1;
          }
          if (cursorX >= gridSize.w - 1) break;
        }
        if (cursorX >= gridSize.w - 1) break;
        const next = { ...p, x: cursorX, y: cursorY };
        occupied.add(`${cursorX},${cursorY}`);
        backKitchenPlacements.push(next);
        cursorY += 1;
      }
    }
  }

  // Clamp any stray placements onto walls after width changes.
  placements = placements.filter(
    (p) =>
      p.x >= 0 &&
      p.y >= 0 &&
      p.x < gridSize.w &&
      p.y < gridSize.h &&
      !isPerimeterWallCell(p.x, p.y, gridSize.w, gridSize.h),
  );
  backKitchenPlacements = backKitchenPlacements.filter(
    (p) =>
      p.x >= 0 &&
      p.y >= 0 &&
      p.x < gridSize.w &&
      p.y < gridSize.h &&
      !isPerimeterWallCell(p.x, p.y, gridSize.w, gridSize.h),
  );

  if (gridSize.w > MAX_GRID_SIZE) {
    gridSize = { ...gridSize, w: MAX_GRID_SIZE };
  }

  return { gridSize, placements, backKitchenPlacements };
}

export function createNewGameState(seed?: number): GameState {
  const globalRunSeed = seed ?? createRng(Date.now()).nextInt(1, 0x7fffffff);
  const starter = createStarterMap();
  const placements = starter.placements.map((p) => ({ ...p }));
  const tableCount = placements.filter((p) => p.itemKey.startsWith('table')).length;
  return {
    saveVersion: CURRENT_SAVE_VERSION,
    globalRunSeed,
    day: 1,
    cash: STARTING_CASH,
    prestige: 0,
    rating: 3,
    unlockedIngredientIds: [...NEW_GAME_STARTER_IDS],
    purchasedEquipmentIds: [...STARTING_EQUIPMENT_IDS],
    discoveredRecipeIds: [],
    recipeMastery: {},
    unlockedAchievementIds: [],
    gridSize: { ...starter.gridSize },
    placements,
    backKitchenPlacements: [],
    seatingCapacity: seatingFromPlacements(placements),
    tableCount,
    decorPurchasedCounts: createEmptyDecorPurchasedCounts(),
    gridExpansionCount: 0,
    kitchenAnnexOwned: false,
    ingredientUnlockIndex: 0,
    activeDay: null,
    composeDraftIngredientIds: undefined,
    stats: {
      totalCustomersServed: 0,
      totalEarnings: 0,
      prestigesTotal: 0,
    },
  };
}

export function normalizeGameState(raw: GameState): GameState {
  const kitchenAnnexOwned = Boolean(raw.kitchenAnnexOwned);
  const migrated = migrateAnnexWidthToBackRoom(raw);
  const legacyPlacements = migrated.placements;
  const placements = normalizeMainFloorPlacements(
    migrated.gridSize,
    legacyPlacements,
    kitchenAnnexOwned,
  );
  const unlockedIngredientIds = raw.unlockedIngredientIds ?? [...NEW_GAME_STARTER_IDS];
  const tableCount =
    raw.tableCount ?? Math.max(2, placements.filter((p) => p.itemKey.startsWith('table')).length);
  let activeDay = raw.activeDay ?? null;
  let composeDraftIngredientIds = raw.composeDraftIngredientIds;

  if (activeDay?.floor) {
    const rawFloor = activeDay.floor;
    const seats = seatsFromPlacements(placements);
    const survivingTableIds = new Set(
      placements
        .filter((placement) => placement.itemKey.startsWith('table'))
        .map((placement) => placement.id),
    );
    const seatsByKey = new Map(
      seats.map((seat) => [`${seat.tablePlacementId}:${seat.slotIndex}`, seat]),
    );
    const recoveredCustomerIds = new Set(
      rawFloor.pool
        .filter(
          (guest) =>
            (seats.length === 0 && guest.stage !== 'done') ||
            (guest.seat !== undefined &&
              !survivingTableIds.has(guest.seat.tablePlacementId)),
        )
        .map((guest) => guest.customer.id),
    );
    const playerRoom =
      rawFloor.playerRoom === 'back_kitchen' && kitchenAnnexOwned
        ? 'back_kitchen'
        : 'main';
    const playerPosition =
      playerRoom === 'main'
        ? recoverMainFloorPlayerPosition(
            migrated.gridSize,
            placements,
            kitchenAnnexOwned,
            rawFloor.playerPosition,
          )
        : rawFloor.playerPosition;
    let tickets = rawFloor.tickets
      .filter((ticket) => !recoveredCustomerIds.has(ticket.customerId))
      .map((ticket) => ({
        ...ticket,
        ingredientIds: Array.isArray(ticket.ingredientIds)
          ? [...ticket.ingredientIds]
          : [],
      }));
    const rawSelectedTicketId = rawFloor.selectedTicketId ?? null;
    const rawCarriedTicketId = rawFloor.carriedTicketId ?? null;
    const carriedTicketId = tickets.some(
      (ticket) =>
        ticket.id === rawCarriedTicketId && ticket.status === 'plated',
    )
      ? rawCarriedTicketId
      : null;
    const preferredOpenTicket =
      tickets.find(
        (ticket) =>
          ticket.id === rawSelectedTicketId && ticket.status === 'open',
      ) ?? tickets.find((ticket) => ticket.status === 'open');
    const selectedTicketId = carriedTicketId
      ? null
      : (preferredOpenTicket?.id ?? null);

    // Floor saves made before ticket-owned drafts kept the current recipe on
    // GameState. Move it once to the effective open ticket, preserving order
    // while dropping duplicates, locked/unknown ids, and anything after six.
    if (Array.isArray(composeDraftIngredientIds)) {
      const target = preferredOpenTicket;
      if (target) {
        // Persistence can validate against the save's unlocked allowlist. The
        // content-aware draft/plate reducer checks catalog membership again
        // before accepting any later interaction.
        const unlocked = new Set(unlockedIngredientIds);
        const seen = new Set<string>();
        const migratedDraft: string[] = [];
        for (const ingredientId of composeDraftIngredientIds) {
          if (
            typeof ingredientId !== 'string' ||
            !unlocked.has(ingredientId) ||
            seen.has(ingredientId)
          ) {
            continue;
          }
          seen.add(ingredientId);
          migratedDraft.push(ingredientId);
          if (migratedDraft.length === MAX_DISH_INGREDIENTS) break;
        }
        tickets = tickets.map((ticket) =>
          ticket.id === target.id
            ? { ...ticket, ingredientIds: migratedDraft }
            : ticket,
        );
      }
    }

    activeDay = {
      ...activeDay,
      floor: {
        ...rawFloor,
        seats,
        tables: rawFloor.tables.filter((table) =>
          survivingTableIds.has(table.placementId),
        ),
        pool: rawFloor.pool.map((guest) => {
          if (recoveredCustomerIds.has(guest.customer.id)) {
            return {
              ...guest,
              stage: 'done' as const,
              seat: undefined,
              motionPosition: undefined,
              eatTicksRemaining: 0,
            };
          }
          if (!guest.seat) return guest;
          return {
            ...guest,
            seat: seatsByKey.get(
              `${guest.seat.tablePlacementId}:${guest.seat.slotIndex}`,
            ),
          };
        }),
        tickets,
        carriedTicketId,
        selectedTicketId,
        playerRoom,
        playerPosition,
      },
    };
    composeDraftIngredientIds = undefined;
  }

  return {
    saveVersion: CURRENT_SAVE_VERSION,
    globalRunSeed: raw.globalRunSeed ?? 1,
    day: raw.day ?? 1,
    cash: raw.cash ?? STARTING_CASH,
    prestige: raw.prestige ?? 0,
    rating: raw.rating ?? 3,
    unlockedIngredientIds,
    purchasedEquipmentIds: raw.purchasedEquipmentIds ?? [...STARTING_EQUIPMENT_IDS],
    discoveredRecipeIds: raw.discoveredRecipeIds ?? [],
    recipeMastery: raw.recipeMastery ?? {},
    unlockedAchievementIds: raw.unlockedAchievementIds ?? [],
    gridSize: migrated.gridSize,
    placements,
    backKitchenPlacements: migrated.backKitchenPlacements,
    seatingCapacity: seatingFromPlacements(placements),
    tableCount,
    decorPurchasedCounts: normalizeDecorPurchasedCounts(
      raw.decorPurchasedCounts,
      legacyPlacements,
    ),
    gridExpansionCount: raw.gridExpansionCount ?? 0,
    kitchenAnnexOwned,
    ingredientUnlockIndex: raw.ingredientUnlockIndex ?? 0,
    activeDay,
    composeDraftIngredientIds,
    stats: raw.stats ?? {
      totalCustomersServed: 0,
      totalEarnings: 0,
      prestigesTotal: 0,
    },
  };
}

export function cloneGameState(state: GameState): GameState {
  return structuredClone(state);
}
