import { useGameStore } from '../store/game-store.ts';
import { playSfx, setAudioFlagBridge, syncMusicEnabled } from '../assets/audio.ts';
import {
  emitVisualJuice,
  type VisualJuiceKind,
} from '../assets/visual-juice.ts';

let attached = false;

function playJuiceSfx(
  id: 'serve' | 'review' | 'placement',
  volume?: number,
): void {
  playSfx(id, volume);
  emitVisualJuice(id satisfies VisualJuiceKind);
}

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
  let prevDeliverSting = Boolean(
    (useGameStore.getState() as { playDeliverSting?: boolean }).playDeliverSting,
  );

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (state.audioEnabled !== prev.audioEnabled || state.musicEnabled !== prev.musicEnabled) {
      syncFlags();
    }

    if (state.pendingReview && !prevPendingReview) {
      playJuiceSfx('review');
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
      playJuiceSfx('placement', 0.65);
    }
    prevPlacementsLen = state.placements.length;

    const nextTicketIds = new Set(
      state.activeDay?.floor?.tickets.map((ticket) => ticket.id) ?? [],
    );
    if ([...nextTicketIds].some((ticketId) => !knownTicketIds.has(ticketId))) {
      playSfx('uiClick', 0.7);
    }
    knownTicketIds = nextTicketIds;

    // Floor deliver sets this ephemeral UI flag (CUSTOMER_SERVED). Canvas may
    // also play `serve` on FLOOR_DELIVER — emit juice here; play SFX only when
    // the canvas path did not already arm the sting this tick.
    const deliverSting = Boolean(
      (state as { playDeliverSting?: boolean }).playDeliverSting,
    );
    if (deliverSting && !prevDeliverSting) {
      // Canvas already plays the serve sting on successful FLOOR_DELIVER;
      // this flag couples the matching visual juice and clears the ephemeral bit.
      emitVisualJuice('serve');
      queueMicrotask(() => {
        const current = useGameStore.getState() as {
          playDeliverSting?: boolean;
        };
        if (current.playDeliverSting) {
          useGameStore.setState({ playDeliverSting: false } as never);
        }
      });
    }
    prevDeliverSting = deliverSting;
  });

  const originalDispatch = useGameStore.getState().dispatch.bind(useGameStore.getState());
  useGameStore.setState({
    dispatch: async (action) => {
      await originalDispatch(action);
      if (action.type === 'SERVE_DISH') {
        playJuiceSfx('serve');
      }
    },
  });

  return () => {
    unsubscribe();
    attached = false;
  };
}
