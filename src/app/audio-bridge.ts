import { useGameStore } from '../store/game-store.ts';
import {
  playSfx,
  setAudioFlagBridge,
  syncMusicEnabled,
  startMusicLoop,
} from '../assets/audio.ts';
import {
  emitVisualJuice,
  type VisualJuiceKind,
} from '../assets/visual-juice.ts';

let attached = false;

function masterVolume(): number {
  const volume = useGameStore.getState().audioVolume;
  return typeof volume === 'number' && Number.isFinite(volume)
    ? Math.min(1, Math.max(0, volume))
    : 1;
}

function playJuiceSfx(
  id: 'serve' | 'review' | 'placement',
  volume?: number,
): void {
  playSfx(id, (volume ?? 0.85) * masterVolume());
  emitVisualJuice(id satisfies VisualJuiceKind);
}

function playScaledSfx(
  id: Parameters<typeof playSfx>[0],
  volume = 0.85,
): void {
  playSfx(id, volume * masterVolume());
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
    if (state.musicEnabled) {
      startMusicLoop(0.35 * masterVolume());
    }
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
    if (
      state.audioEnabled !== prev.audioEnabled ||
      state.musicEnabled !== prev.musicEnabled ||
      state.audioVolume !== prev.audioVolume
    ) {
      syncFlags();
    }

    if (state.pendingReview && !prevPendingReview) {
      playJuiceSfx('review');
    }
    prevPendingReview = state.pendingReview;

    if (state.activeDay && !prevActiveDay) {
      playScaledSfx('dayOpen');
    }
    if (!state.activeDay && prevActiveDay && state.daySummary) {
      playScaledSfx('dayClose');
    }
    prevActiveDay = state.activeDay;

    if (state.cash < prevCash && state.screen === 'shop') {
      playScaledSfx('purchase');
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
      playScaledSfx('uiClick', 0.7);
    }
    knownTicketIds = nextTicketIds;

    const deliverSting = Boolean(
      (state as { playDeliverSting?: boolean }).playDeliverSting,
    );
    if (deliverSting && !prevDeliverSting) {
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
