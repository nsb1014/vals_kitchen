import {
  nextTutorialStep,
  type TutorialStepId,
} from '../../domain/floor/tutorial.ts';
import { useGameStore } from '../../store/game-store.ts';
import type { RestaurantApp } from '../../canvas/RestaurantApp.ts';
import {
  buildTutorialHighlightCamera,
  highlightPointToOverlayStyle,
  resolveTutorialHighlightPoint,
} from '../presentation/tutorial-highlight.ts';

const PULSE_CSS = `
@keyframes vk-tutorial-pulse {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.18); opacity: 1; }
}
.tutorial-highlight-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 28;
  overflow: hidden;
}
.tutorial-highlight-pulse {
  position: absolute;
  border-radius: 999px;
  border: 3px solid rgba(255, 214, 120, 0.95);
  box-shadow:
    0 0 0 2px rgba(40, 24, 12, 0.55),
    0 0 18px rgba(255, 196, 90, 0.55);
  background: rgba(255, 210, 110, 0.18);
  animation: vk-tutorial-pulse 1.1s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .tutorial-highlight-pulse {
    animation: none;
    opacity: 0.95;
  }
}
`;

let styleInjected = false;

function ensurePulseStyles(): void {
  if (styleInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.dataset.vkTutorialHighlight = '1';
  style.textContent = PULSE_CSS;
  document.head.appendChild(style);
  styleInjected = true;
}

/**
 * DOM-side spatial tutorial cue. Coordinates with `tutorial.ts` highlight
 * targets; does not edit canvas layers.
 */
export function mountTutorialHighlightOverlay(
  host: HTMLElement,
  getRestaurantApp: () => RestaurantApp | null,
): () => void {
  ensurePulseStyles();
  const overlay = document.createElement('div');
  overlay.className = 'tutorial-highlight-overlay';
  overlay.dataset.testid = 'tutorial-highlight-overlay';
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  host.appendChild(overlay);

  let raf = 0;
  let lastStep: TutorialStepId | null | undefined;

  const render = () => {
    raf = 0;
    const state = useGameStore.getState();
    const floor = state.activeDay?.floor;
    const interactive =
      Boolean(floor) &&
      state.day === 1 &&
      state.modifierDismissed &&
      !state.daySummary &&
      !state.pendingReview &&
      !state.ceremony &&
      state.screen === 'restaurant';

    if (!interactive || !floor) {
      overlay.hidden = true;
      overlay.innerHTML = '';
      lastStep = null;
      return;
    }

    const step = nextTutorialStep(floor, true);
    const point = resolveTutorialHighlightPoint(
      step,
      floor,
      state.placements,
      state.gridSize,
    );
    if (!point) {
      overlay.hidden = true;
      overlay.innerHTML = '';
      lastStep = step;
      return;
    }

    const canvas =
      host.querySelector<HTMLElement>('[data-testid="restaurant-canvas"]') ??
      host;
    const liveCamera = getRestaurantApp()?.camera.state ?? null;
    const camera = buildTutorialHighlightCamera(
      state.gridSize.w,
      state.gridSize.h,
      canvas,
      liveCamera,
    );
    const style = highlightPointToOverlayStyle(point, canvas, camera);
    overlay.hidden = false;
    if (step !== lastStep || !overlay.firstElementChild) {
      overlay.innerHTML = `<div class="tutorial-highlight-pulse" data-testid="tutorial-highlight-pulse" data-target="${point.target}" aria-label="${point.label}"></div>`;
    }
    const pulse = overlay.firstElementChild as HTMLElement | null;
    if (pulse) {
      pulse.style.left = style.left;
      pulse.style.top = style.top;
      pulse.style.width = style.width;
      pulse.style.height = style.height;
    }
    lastStep = step;
  };

  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(render);
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (
      state.activeDay?.floor !== prev.activeDay?.floor ||
      state.day !== prev.day ||
      state.modifierDismissed !== prev.modifierDismissed ||
      state.daySummary !== prev.daySummary ||
      state.pendingReview !== prev.pendingReview ||
      state.ceremony !== prev.ceremony ||
      state.screen !== prev.screen ||
      state.placements !== prev.placements ||
      state.gridSize !== prev.gridSize
    ) {
      schedule();
    }
  });

  const onResize = () => schedule();
  window.addEventListener('resize', onResize);
  schedule();

  return () => {
    unsubscribe();
    window.removeEventListener('resize', onResize);
    if (raf) cancelAnimationFrame(raf);
    overlay.remove();
  };
}
