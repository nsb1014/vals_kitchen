# Design: Approach A — readable walk + deploy stickiness

Date: 2026-07-25  
Status: Implementing

## Problem

Live Cloudflare build matches `main`, but the player still feels click-placed and reads as a muddy 16×16 speck. Cache-first service worker can also pin shell/JS across deploys.

## Decision (Approach A)

1. **PWA:** network-first for HTML/JS/CSS/SW; cache-first only for atlases/audio/`/data` and content-hashed `/assets/*`.
2. **Nav:** default 2 tiles/s world lerp; keep mid-cell world pos on repath; destination marker; tighter per-tick catch-up cap so background tabs cannot skip a whole path in one frame.
3. **Actors:** reuse player/guest sprites (no per-frame rebuild); Kenney Urban walk frames packed at **32×32** (nearest-neighbor 2×); player drawn at **64px** (2× atlas); guests at 32px.
4. **Out of scope:** restaurant floor/furniture art redesign (follow-up).

## Acceptance

- After deploy, hard refresh is enough for new JS (SW no longer serves stale `index.html` forever).
- Tap-to-move during service slides between cells with visible walk frames and a destination cue.
- Player silhouette is larger than one floor tile.
