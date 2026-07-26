# Cozy Restaurant Professional Program — Design

**Date:** 2026-07-26  
**Status:** Approved by locked overnight north star (user asleep; genre baseline locked — no reopen)  
**Product:** Restaurant Simulator / Val's Kitchen (`vals_kitchen`)  
**Live:** https://vals-kitchen.nickbrownchrome.workers.dev  
**Repo:** `nsb1014/vals_kitchen`

## 1. North star (LOCKED)

| Axis | Lock |
|------|------|
| Primary reference | **Good Pizza, Great Pizza** — manual cook, quirky prefs/regulars, shop glow-up, narrative warmth, challenge **without** panic |
| Tone / pacing | **Hungry Hearts** — warm story-diner pace |
| Floor fantasy / art bar | **Chef RPG** — ¾ pixel walkable restaurant, decorate, Y-sort |
| Reject | Cooking Fever / Madness rush timers; pure idle AFK tycoon as core loop |
| Keep | Flavor-preference matching, walkable floor service, prestige/soft reset, **CC0 only** |
| Art policy | **Generate** project-CC0 assets as needed; record honestly in `CREDITS.json`; no fabricated Kenney provenance. Existing Kenney Urban walk frames may be kept/improved if visually consistent |
| Cozy constraints | No patience meters, no day-clock fails, no rush mode (already PRD) |

Prior immersive-floor design remains authoritative for service rules:  
[`2026-07-25-immersive-floor-service-design.md`](./2026-07-25-immersive-floor-service-design.md).

## 2. Problem (live gaps)

Phases 0–11 shipped a playable concurrent floor loop, but the product still reads as a **programmer prototype**:

1. **Visual identity** — 16×16 generated tiles/furniture are flat rectangles with accent bars; furniture atlas ~839 B; walls/door/stations lack Chef RPG silhouette; UI is generic dark-purple (`#1a1a2e`) / system-ui, not a cozy diner.
2. **Service immersion** — walk lerp + dest marker exist, but carry-plate, station/table feedback, door in/out, and camera “feel” are thin.
3. **Loop completeness** — day open → service → summary → shop/build → next day has known dead-UI / tutorial roughness (Progress Phase 8–9 partial).
4. **Meta depth** — analytic prestige proxy shipped; early match retune landed; still short of GPGP-like mastery/progression weight and live pacing polish.

## 3. Program tracks (strict order)

Each track must land **playable on `main`** before the next expands scope. Scope-fence: flag adjacent issues; do not silently expand mid-track.

### Track A — Visual identity

**Goal:** Cloudflare-quality room no longer looks like placeholders.

| Deliverable | Acceptance |
|-------------|------------|
| Generated restaurant tile set | Distinct dining wood + kitchen tile floors; wallpaper/wainscot walls; readable door; rug/trim variants as needed |
| Furniture / stations / decor | Distinct silhouettes per station family; tables + chairs; plant/decor; feet-aligned draw; honest CC0 credits |
| Characters | Larger consistent player + ≥2 guest variants; walk frames readable at service scale; may keep Kenney Urban if recolored/framed consistently **or** generate project-CC0 chef/guest sheets |
| UI palette | Warm diner CSS tokens (walnut / parchment / sage / soft gold) replacing purple-void shell; screens inherit tokens |
| Pipeline | `build-restaurant-tiles.py` → `build-assets.ts` → atlases + `CREDITS.json`; `audit:assets` green |

**Out of scope for A:** new service verbs, balance retunes, tutorial rewrite, rush/patience features.

### Track B — Service immersion

**Goal:** Guest walk-in/out, carry plate, station/table feedback, destination/walk clarity, camera/feel.

| Deliverable | Acceptance |
|-------------|------------|
| Door line / enter-exit | Guests visibly approach door, seat path, leave toward door |
| Carry plate | Player shows plated dish while carrying; clear on deliver |
| Interact feedback | Adjacent station/table highlight or pulse; wrong-seat already toasted |
| Camera | Follow player with soft clamp; no jarring snap on tap |
| Walk clarity | Dest marker + facing/walk frames remain; optional foot-dust / seat sit pose if cheap |

**Out of scope for B:** shop economy changes, mastery curve, new screens.

### Track C — Loop completeness

**Goal:** Tutorial → full day → summary → shop/build → next day airtight; no dead UI.

| Deliverable | Acceptance |
|-------------|------------|
| Day-1 tutorial | Forced prompts cover seat → order → cook → deliver → clear → close |
| Day summary | Always reachable; cash/rating/mastery deltas clear; Continue → shop or floor |
| Shop / build | Purchases placeable; no blank panels; expansions grow room |
| Resume | Mid-day reload restores floor state (already required) |
| Dead UI audit | Every nav target shows working content or intentional empty-state copy |

**Out of scope for C:** deep balance spreadsheet, new prestige systems.

### Track D — Meta depth

**Goal:** Progression weight closer to GPGP without panic.

| Deliverable | Acceptance |
|-------------|------------|
| Mastery feedback | Recipe level visible on serve / recipe book; bonus felt |
| Pacing | Early days teach loop; unlocks feel earned; soft reset retains warmth |
| Regulars / prefs | Quirky phrase variety + optional regular callback if cheap |
| Live retune | Match/tip/customers-per-day dials from play evidence; **do not weaken tests** |

**Out of scope for D:** multiplayer, narrative quest graph, non-CC0 art.

## 4. Art & credit policy

1. Prefer **project-generated CC0** for room identity (floors, walls, furniture, stations, decor, UI chrome).
2. Kenney CC0 walk frames allowed if they remain the best readable locomotion source; credits must say Kenney, never invent packs.
3. `public/assets/CREDITS.json` is generated by `scripts/build-assets.ts` — never hand-edit as source of truth.
4. Approximation notes must say “generated” when generated; never attribute generated art to Kenney.

### Visual language (Track A)

- **Perspective:** ¾ top-down; sprites may be taller than one logical tile; feet on tile bottom.
- **Logical grid:** unchanged — `ART_TILE_PX=16`, `TILE_PX=32` (2×).
- **Art resolution:** Generate **32×32** (and tall **32×48** furniture where needed), packed without further upscale, drawn feet-aligned into the 32px cell (overflow upward for Y-sort).
- **Palette:** warm oak floors, cream/sage walls, soft teal kitchen tile, walnut furniture, copper/steel station metals, soft gold UI accents — cozy diner, not neon, not purple void.
- **Characters:** player reads as cook (apron or hat cue); guests 2+ outfit variants; same facing/walk frame contract as `ActorLayer`.

## 5. Architecture constraints

- Stack: Vite 8, TS 5.9 strict, PixiJS 8, DOM+CSS Modules, Zustand, idb-keyval, pwa-lite — see `docs/Tech-Stack.md`.
- Initial JS gzip hard cap **280,000**; atlases lazy ≤ 4 MB total.
- Fast Vitest suite must stay green; never weaken thresholds or swap fixtures to pass.
- Domain formulas owned by `docs/PRD.md`; structural bands (3–6 ingredients, 0–10 review, 0–6 rating) unchanged without explicit code+test work.
- Deploy: Cloudflare Workers Static Assets (`vals-kitchen`); push `main` triggers prior session pattern.

## 6. Delivery protocol (overnight)

1. Write this program design + per-track implementation plan under `docs/superpowers/plans/`.
2. Execute track → fast suite green → update `docs/Progress.md` → commit → push branch → merge to `main` → push `main`.
3. Parallel subagents with **explicit file ownership fences**.
4. Subagent models: advanced/design/art/architecture → `cursor-grok-4.5-high`; mechanical wiring/tests/docs → `composer-2.5-fast`.
5. Morning briefing: commits on main, remaining gaps, live verify steps.

## 7. Success criteria (program)

| Criterion | Measure |
|-----------|---------|
| Room reads as cozy restaurant | Hard refresh live: wood/kitchen floors, walls, door, distinct stations, readable characters |
| Service feels walkable | Tap-to-move, carry, seat/station feedback without rush UI |
| Loop airtight | New game through day close → summary → shop → day 2 without dead screens |
| Meta weight | Mastery/progression feedback visible; tests still enforce floors |
| Legal | CREDITS + audit:assets honest CC0 |

## 8. Track plan index

| Track | Plan |
|-------|------|
| A | [`../plans/2026-07-26-track-a-visual-identity.md`](../plans/2026-07-26-track-a-visual-identity.md) |
| B | `../plans/2026-07-26-track-b-service-immersion.md` (write at Track B start) |
| C | `../plans/2026-07-26-track-c-loop-completeness.md` (write at Track C start) |
| D | `../plans/2026-07-26-track-d-meta-depth.md` (write at Track D start) |

## 9. Spec self-review

- No TBD placeholders in Track A acceptance.
- Tracks ordered; A does not pull B–D mechanics.
- Art policy matches AGENTS.md / PRD §13 art rulings.
- Bundle and test non-weaken rules explicit.
