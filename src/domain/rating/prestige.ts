import type { GameState } from '../state/game-state.ts';

export function applyPrestige(state: GameState): GameState {
  return {
    ...state,
    prestige: state.prestige + 1,
    rating: 3,
    stats: {
      ...state.stats,
      prestigesTotal: state.stats.prestigesTotal + 1,
    },
  };
}
