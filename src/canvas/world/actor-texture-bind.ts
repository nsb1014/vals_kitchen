/** Pure helpers for actor atlas rebinds after lazy load / refresh. */

export function nextBoundFrameKey(opts: {
  frameKey: string;
  lastFrameKey: string;
  /** True when the previous bind successfully found a texture. */
  hadTexture: boolean;
}): boolean {
  if (opts.frameKey !== opts.lastFrameKey) return true;
  // Same pose, but last attempt fell through to cue-dot fallback — retry when atlases arrive.
  return !opts.hadTexture;
}
