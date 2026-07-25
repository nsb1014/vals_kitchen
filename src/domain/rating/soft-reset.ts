import {
  NEW_GAME_STARTER_IDS,
  SOFT_RESET_STARTER_IDS,
  STARTING_EQUIPMENT_IDS,
} from '../types.ts';
import type { GameState } from '../state/game-state.ts';
import {
  seatingFromPlacements,
  SOFT_RESET_CASH,
} from '../state/game-state.ts';

export function applySoftReset(state: GameState): GameState {
  return {
    ...state,
    cash: SOFT_RESET_CASH,
    rating: 3,
    unlockedIngredientIds: [...SOFT_RESET_STARTER_IDS],
    purchasedEquipmentIds: [...STARTING_EQUIPMENT_IDS],
    activeDay: null,
    composeDraftIngredientIds: undefined,
    ingredientUnlockIndex: 0,
    seatingCapacity: seatingFromPlacements(state.placements),
  };
}

export function isSoftResetStarter(id: string): boolean {
  return (SOFT_RESET_STARTER_IDS as readonly string[]).includes(id);
}

export function isNewGameStarter(id: string): boolean {
  return (NEW_GAME_STARTER_IDS as readonly string[]).includes(id);
}
