/** Tiny audio→visual bridge bus for canvas/HUD juice (no Pixi imports). */

export type VisualJuiceKind = 'serve' | 'review' | 'placement';

type VisualJuiceListener = (kind: VisualJuiceKind) => void;

const listeners = new Set<VisualJuiceListener>();

export function subscribeVisualJuice(listener: VisualJuiceListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitVisualJuice(kind: VisualJuiceKind): void {
  for (const listener of listeners) {
    listener(kind);
  }
}

export function clearVisualJuiceListenersForTests(): void {
  listeners.clear();
}
