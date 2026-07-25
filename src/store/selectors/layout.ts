import type { GameStore } from '../game-store.ts';

export const selectPlacements = (state: GameStore) => state.placements;
export const selectGridSize = (state: GameStore) => state.gridSize;
export const selectEditLayoutMode = (state: GameStore) => state.editLayoutMode;
export const selectSeatingCapacity = (state: GameStore) => state.seatingCapacity;
