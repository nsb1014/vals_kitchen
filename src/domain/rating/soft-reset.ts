import {
  NEW_GAME_STARTER_IDS,
  SOFT_RESET_STARTER_IDS,
  STARTING_EQUIPMENT_IDS,
} from '../types.ts';
import type { GameState } from '../state/game-state.ts';
import {
  createDefaultPlacements,
  SOFT_RESET_CASH,
  STARTING_GRID,
} from '../state/game-state.ts';
import { resetRunLayout } from '../economy/purchases.ts';

export function applySoftReset(state: GameState): GameState {
  const base = resetRunLayout({
    ...state,
    cash: SOFT_RESET_CASH,
    rating: 3,
    unlockedIngredientIds: [...SOFT_RESET_STARTER_IDS],
    purchasedEquipmentIds: [...STARTING_EQUIPMENT_IDS],
    activeDay: null,
    composeDraftIngredientIds: undefined,
    ingredientUnlockIndex: 0,
  });
  return {
    ...base,
    gridSize: { ...STARTING_GRID },
    placements: createDefaultPlacements(),
    seatingCapacity: 4,
  };
}

export function isSoftResetStarter(id: string): boolean {
  return (SOFT_RESET_STARTER_IDS as readonly string[]).includes(id);
}

export function isNewGameStarter(id: string): boolean {
  return (NEW_GAME_STARTER_IDS as readonly string[]).includes(id);
}
