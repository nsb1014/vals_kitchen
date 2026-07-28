import { useGameStore } from '../store/game-store.ts';
import { playSfx, setAudioFlagBridge, syncMusicEnabled } from '../assets/audio.ts';

let attached = false;

export function attachAudioBridge(): () => void {
  if (attached || typeof window === 'undefined') return () => undefined;
  attached = true;

  const syncFlags = () => {
    const state = useGameStore.getState();
    setAudioFlagBridge({
      audioEnabled: state.audioEnabled,
      musicEnabled: state.musicEnabled,
    });
    syncMusicEnabled(state.musicEnabled);
  };

  syncFlags();

  let prevPendingReview = useGameStore.getState().pendingReview;
  let prevActiveDay = useGameStore.getState().activeDay;
  let prevCash = useGameStore.getState().cash;
  let prevPlacementsLen = useGameStore.getState().placements.length;
  let knownTicketIds = new Set(
    useGameStore.getState().activeDay?.floor?.tickets.map((ticket) => ticket.id) ??
      [],
  );

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (state.audioEnabled !== prev.audioEnabled || state.musicEnabled !== prev.musicEnabled) {
      syncFlags();
    }

    if (state.pendingReview && !prevPendingReview) {
      playSfx('review');
    }
    prevPendingReview = state.pendingReview;

    if (state.activeDay && !prevActiveDay) {
      playSfx('dayOpen');
    }
    if (!state.activeDay && prevActiveDay && state.daySummary) {
      playSfx('dayClose');
    }
    prevActiveDay = state.activeDay;

    if (state.cash < prevCash && state.screen === 'shop') {
      playSfx('purchase');
    }
    prevCash = state.cash;

    if (state.placements.length !== prevPlacementsLen && !state.activeDay) {
      playSfx('placement', 0.65);
    }
    prevPlacementsLen = state.placements.length;

    const nextTicketIds = new Set(
      state.activeDay?.floor?.tickets.map((ticket) => ticket.id) ?? [],
    );
    if ([...nextTicketIds].some((ticketId) => !knownTicketIds.has(ticketId))) {
      playSfx('uiClick', 0.7);
    }
    knownTicketIds = nextTicketIds;
  });

  const originalDispatch = useGameStore.getState().dispatch.bind(useGameStore.getState());
  useGameStore.setState({
    dispatch: async (action) => {
      await originalDispatch(action);
      if (action.type === 'SERVE_DISH') {
        playSfx('serve');
      }
    },
  });

  return () => {
    unsubscribe();
    attached = false;
  };
}
