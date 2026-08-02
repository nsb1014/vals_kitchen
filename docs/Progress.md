# Progress Tracker

**Last updated:** 2026-08-02
**Purpose:** Living status table — not a narrative. Update as phases complete.

---

## Overall Status

| Milestone | Status |
|-----------|--------|
| Design research | **Complete** |
| Design documentation (7 docs) | **Complete** — reconciled with Rulings 7–12 |
| Implementation Phase 0 | **Done** |
| Implementation Phase 1 | **Done** |
| Implementation Phase 2 | **Done** |
| Implementation Phase 3 | **Done** |
| Implementation Phase 4 — grid + layout placement | **Done** |
| Implementation Phase 5 — service-day loop | **Done** |
| Implementation Phase 6 — UI screens | **Done** |
| Implementation Phase 7 — CC0 art + audio | **Done** — project-CC0 chibi chef/guests/restaurant + generated ingredient icons + Kenney audio |
| Implementation Phase 8 — balance tuning | **Partial** — analytic proxy / prestige pacing shipped; live retune still open |
| Implementation Phase 9 — device QA / PWA hardening | **Partial** — headless Chromium e2e (55 tests) green; real iPhone QA not done |
| Implementation Phase 10 — production deploy | **Done** — Cloudflare Workers Static Assets (`vals-kitchen`) |
| Implementation Phase 11 — immersive floor service | **Done** (vertical slice) — concurrent floor service, station compose/deliver, adjacency interacts, character frames; measured initial JS gzip **173,070** / 280k cap ([design](./superpowers/specs/2026-07-25-immersive-floor-service-design.md), [plan](./superpowers/plans/2026-07-25-immersive-floor-vertical-slice.md)) |
| Overnight program Track A — visual identity | **Done** — generated 32×32 floors/walls + 32×48 furniture/stations, feet-align, guest walk frames, warm diner UI tokens; gzip **179,236** ([design](./superpowers/specs/2026-07-26-cozy-restaurant-professional-program-design.md), [plan](./superpowers/plans/2026-07-26-track-a-visual-identity.md)) |
| Overnight program Track B — service immersion | **Done** — carry plate, door wait/leave, interact hints, soft camera; fast suite 133 ([plan](./superpowers/plans/2026-07-26-track-b-service-immersion.md)) |
| Overnight program Track C — loop completeness | **Done** — mid-day review Continue, floor autosave/hydrate, summary→shop/floor, tutorial close step; fast suite 144 ([plan](./superpowers/plans/2026-07-26-track-c-loop-completeness.md)) |
| Overnight program Track D — meta depth | **Done** — mastery on reviews + recipe-book progress + pacing HUD; fast suite 147 ([plan](./superpowers/plans/2026-07-26-track-d-meta-depth.md)) |
| Edit catalog + achievements | **Done** — prestige-flat shop costs, edit + decor catalog, celebration banners, Recipe Book achievements; fast suite 280 ([design](./superpowers/specs/2026-07-27-edit-catalog-achievements-design.md), [plan](./superpowers/plans/2026-07-27-edit-catalog-achievements.md)) |
| Cooking UI + shared chrome | **Done** — tap-to-open cook lifecycle, 100-item flavor/search pantry, locked sheet tiers, shared meta shell; fast suite 297 ([design](./superpowers/specs/2026-07-28-cooking-ui-system-design.md), [plan](./superpowers/plans/2026-07-28-cooking-ui-system.md)) |
| Storybook v2 art migration | **Rolled back** — rejected perspective-mismatched room and character art removed; orthographic restaurant assets retained |
| Chibi responsive UI rebuild | **Done** — exact supplied chef sheet, authored carry poses, project-CC0 chibi cast, purpose-made walls/floors/stations, mobile near-full cooking UX, desktop split workspace + WASD/arrow controls; gameplay rules unchanged |

- Unified floor notifications shipped: one top banner stack and actions-only floor chrome (Chromium CI; Firefox opt-in; WebKit/iOS unverified).

---

## Phase / Task Table

| Phase | Task | Status | Notes |
|-------|------|--------|-------|
| — | [RESEARCH.md](./RESEARCH.md) | Done | Read-only; superseded items noted in PRD §13 |
| — | [PRD.md](./PRD.md) | Done | Rulings 7–12; equipment table §6.3; tiered satisfiability §5.6; new-game cash $500 |
| — | [Tech-Stack.md](./Tech-Stack.md) | Done | Installed versions (Vite 8.1.5, TS 5.9.3, etc.) |
| — | [Frontend-Guidelines.md](./Frontend-Guidelines.md) | Done | |
| — | [Backend-Guidelines.md](./Backend-Guidelines.md) | Done | V9 equipment partition; V5 tier floors |
| — | [Plan.md](./Plan.md) | Done | |
| — | [Error-Tracker.md](./Error-Tracker.md) | Done | |
| 0 | Project scaffolding & CI/deploy | Done | Vite 8, TS 5.9 strict, Vitest, ESLint, PWA stub |
| 0 | Directory structure per Frontend-Guidelines | Done | |
| 0 | README, index.html viewport shell | Done | |
| 1 | Ingredient master list (100) | Done | `src/data/ingredients.json` |
| 1 | Equipment gates (12) | Done | `src/data/equipment.json` |
| 1 | Recipe corpus (~1000) + generator | Done | 1000 recipes; `scripts/build-content.ts` |
| 1 | Customer request generator | Done | `src/domain/day/customer-request-generator.ts` |
| 1 | Content validators (V1–V9) | Done | Vitest + `npm run validate:content` |
| 1 | Archetypes, phrases, modifiers data | Done | archetypes + modifiers JSON |
| 2 | Domain: flavor scoring | Done | aggregate, satisfaction, match stars, recipe match |
| 2 | Domain: economy & tips | Done | costs, tips, purchases, layout helpers |
| 2 | Domain: rating, prestige, soft reset | Done | applyReview, applyPrestige, applySoftReset |
| 2 | Domain: day generation & reducer | Done | generateDay, serveCustomer, gameReducer |
| 2 | Domain: seeded RNG | Done | mulberry32 + fork + daySeed hash |
| 2 | Domain unit tests | Done | Fast suite (CI on every push); long-horizon deep sim retired 2026-07-28 |
| 3 | IndexedDB SaveRepository | Done | `src/persistence/SaveRepository.ts` |
| 3 | Save Code RS1 export/import | Done | lz-string Uint8Array + base64url + checksum |
| 3 | Corruption / backup recovery | Done | backup key + graceful load fallback |
| 3 | Mid-day resume serialization | Done | activeDay + composeDraftIngredientIds |
| 3 | navigator.storage.persist hook | Done | `requestPersistentStorage()` |
| 4 | PixiJS restaurant canvas | Done | Grid + furniture DnD + camera fit; see Overall Status |
| 5 | Service-day loop | Done | Queue serve UI + customer sprite + chat bubble |
| 6 | UI screens | Done | Floor / Shop / Flavors / Recipes / Rating / Settings + nav |
| 7 | CC0 assets | Done | Project-CC0 chibi chef/guests/surfaces/furniture + generated ingredient icons + Kenney audio; CREDITS.json + audit:assets; lazy atlases 2,138,896 B |
| 8 | Balance/tuning | Partial | Analytic proxy / prestige pacing shipped; early-game match-score retune landed 2026-07-25; long-horizon deep sim retired 2026-07-28; further live balance open |
| 9 | iPhone 17 QA | Not started | |
| 10 | Production deploy | Done | Workers Static Assets via `wrangler.toml` (`vals-kitchen`); no `_redirects` catch-all |
| 11 | Immersive floor vertical slice | Done | FloorDay, mastery/save v2, path-lerp walk + Urban walk cycle, station compose/plate/deliver, adjacency set/clear/orders, wrong-seat toast; gzip 173,070 |
| A | Cozy visual identity | Done | Generated diner tiles/furniture, feet-align, character walk packs, `--vk-*` UI palette; fast suite 131; gzip 179,236 |
| B | Service immersion | Done | Carry plate, leaving→door, interact hints, soft camera; fast suite 133 |
| C | Loop completeness | Done | Review Continue, floor autosave, summary Shop/Floor, tutorial close; fast suite 144 |
| D | Meta depth | Done | Mastery review line, recipe book progress, day pacing HUD; fast suite 147 |
| — | Kitchen annex redesign | Done | Separate same-size back-kitchen room + door transfer (replaces +2 width); save v3; fast suite 206 |
| — | Cooking UI + shared chrome | Done | Explicit station-tap compose lifecycle; AND flavor filters + search; compact/mid/near-full/meta-full shells; fast suite 297 |
| — | Chibi responsive UI rebuild | Done | Exact supplied chef source preserved byte-for-byte; actual directional wall/door sprites; cohesive chibi furniture/stations; 5-column mobile pantry; persistent flavor meters; desktop room + side workspace; keyboard and touch controls share pathfinding |

**Status values:** `Not started` | `In progress` | `Blocked` | `Done`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-02 | Visual cohesion: removed Val's border-connected gray/white source matte without changing her supplied source, identity, 128×160 frame canvases, scale, or feet alignment; repacked the shipped character atlas and added pre-build matte/artifact integrity coverage |
| 2026-07-28 | Tickets Order/Ideal views; requests use Flavors-tab axis labels + witness idealProfile; cooking dish bars without numbers |
| 2026-07-28 | Cooking UI + shared chrome Done: explicit station-tap compose, 100-item flavor/search pantry, fixed responsive sheet regions, shared meta panels; fast suite 297 |
| 2026-07-29 | Rolled back Storybook v2 migration; retained orthographic walls/furniture, corrected chair facings, and content-sized open-service panel |
| 2026-07-29 | Rebuilt UI around the supplied chibi chef and espresso/gold reference: new project-CC0 room/furniture pipeline, mobile cooking overlay, desktop split workspace that keeps the complete room visible, corrected two-chair table art, and WASD/arrow controls; no gameplay-rule changes |
| 2026-07-29 | Fixed supplied-chef walk/carry extraction: removed the off-white matte before trimming, cropped on the authored sheet gutters, normalized every frame to one foot baseline, and added asset-build regression guards |
| 2026-07-30 | Fixed mid-walk repath snap, seated depth (guest above table), actor/furniture scale balance, project-CC0 E/W side walls, and clipped guest up-facing crowns |
| 2026-07-30 | Seating composition: camera-biased sit anchors beside top-down tables; chair cells block player walks; guests may still path onto seats; rebalanced actor/furniture scale; richer E/W wall tiles |
| 2026-07-30 | Seating architecture (no tuck dials): seat-cell centers beside tables; flat tables sort under actors; seated scale matches chair; nearest atlas filtering + hardened guest alpha; continuous E/W wall columns |
| 2026-07-30 | Guest scale matched to chef; chairs grown to fit; diners sink onto cushion (chair stays planted) |
| 2026-08-01 | Rebuilt seating art as one coordinated high-resolution chibi system: Val-preserving 128×160 player frames, five guest walk/sit sheets, dedicated ticket portraits, proportion-matched table states and backless stools, content-aware gutter slicing, fixed actor scale, shared stool/feet baseline, and separated south-door spawn lanes; food art intentionally deferred |
| 2026-08-01 | Corrected seating composition with corner-free oval tables and side-centered place settings, shifted seated hips from stool centers toward the table, and replaced Val's global white key with border-connected matte removal and fringe cleanup |
| 2026-08-01 | UX loop 1: deferred notifications behind service sheets without losing timer state, restored a legible mobile request → pantry → Plate hierarchy, and added compose focus isolation plus 44px popup targets |
| 2026-08-01 | UX loop 2: restored required Order/Ideal ticket planning with all 15 numeric flavor axes, exposed live 0/4–4/4 capacity and carried-dish state, rejected over-capacity orders before guest mutation, and added keyboard/focus-safe responsive ticket controls; gameplay rules unchanged |
| 2026-08-01 | UX loop 3: made Shop & Edit a named pre-day and post-day path, sorted purchases by immediate actionability, kept ingredient shopping in context, made physical purchases flow directly into named/cancellable placement, clarified completed/next-day summary labels, and hardened shop keyboard, 320px, and 200% zoom behavior; gameplay rules and prices unchanged |
| 2026-08-01 | Gameplay loop 1: made Start Service/review/ceremony/navigation true runtime boundaries without hidden-time catch-up, enabled cooking at all canonical equipment stations, enforced carried-ticket and guest-adjacency delivery in the domain, restored Dirty → Ready clearing, and required complete morning setup before seating; scoring and economy unchanged |
| 2026-08-01 | Gameplay loop 2: made seating and departure animation-authoritative states, prevented orders before physical seat arrival, retained occupied seats/tables through the exit walk, and dirtied tables only after the final diner reaches the door; service pacing and scoring unchanged |
| 2026-08-01 | Gameplay loop 3: made compose drafts ticket-owned and interruption-safe, validated selected-ticket plating at an owned nearby station, restored qualitative nonnumeric cooking guidance with explicit ingredient inspection, selected the next ticket after delivery, and serialized autosaves so the newest service checkpoint wins; scoring and economy unchanged |
| 2026-08-02 | Gameplay loop 4: made seating a physical main-floor interaction shared by the waiting guest and HUD, routed Val to a truly adjacent non-door service cell, enforced proximity in the reducer, accepted full visible-character taps, canceled stale approach intents safely, and clarified entering/waiting/seating guidance; assignment, capacity, pacing, scoring, and economy unchanged |
| 2026-08-02 | Gameplay loop 5: aligned order cues and taps with live 4-ticket capacity, retired order bubbles when state or service overlays take ownership, made passive eating/leaving guidance non-actionable, and distinguished valid plated carries from stale carry IDs at cooking stations; ticket capacity, service pacing, scoring, and economy unchanged |
| 2026-08-02 | Gameplay loop 6: made customer reviews, day summaries, and ceremonies accessible blocking focus scopes with meaningful dialog names, deterministic focus handoffs, trapped mandatory actions, ceremony precedence, and ownership-safe background isolation; service simulation, outcomes, transitions, scoring, and economy unchanged |
| 2026-07-30 | UI: fixed compose food-icon bleed (24→32); removed duplicate floor ticket strip; tickets menu fixed height + single scroll; Order/Ideal share shell |
| 2026-07-24 | Initial 7 design docs written |
| 2026-07-24 | PRD reconciled with Rulings 7–12 |
| 2026-07-24 | Phase 0 scaffolding complete; Phase 1 content layer + validators passing |
| 2026-07-24 | Phase 8 balance: escalating prestige pacing + long-horizon sim verified |
| 2026-07-28 | Retired long-horizon deep sim (`test:sim` / `*.sim.test.ts`); keep analytic proxy + short competent-play smoke in fast suite |
| 2026-07-24 | Post–Phase 5 cleanup: runtime `/data/` fetch (initial JS 157,147 B gzip), PRD §5.6 competent floor 6.75, `MOVE_ITEM` reducer action |
| 2026-07-24 | Phase 7: Kenney CC0 atlases + audio, CREDITS.json, audit:assets CI, Settings credits, lazy asset load (initial JS 171,466 B gzip) |
| 2026-07-25 | Phase 7 asset resourcing: vendored Kenney pixel stack (RPG Urban tiles, Pixel Platformer Food icons, Tiny Dungeon customer); removed ETdoFresh mirror from CI; initial JS 172,078 B gzip |
| 2026-07-25 | Generated ingredient icon set: 9 sprite sheets → `scripts/build-ingredient-icons.py` → 100×32×32 food atlas; CC0-dedicated in CREDITS; food atlas ~111 KB |
| 2026-07-25 | Doc-sync: Tech-Stack §7 + Progress Phase 4–6/10 rows aligned with Workers Static Assets deploy (no `_redirects`); Phase 8 marked Partial |
| 2026-07-25 | Immersive floor redesign approved: concurrent ¾ service, tickets≤4, set/clear, mastery; PRD/Tech-Stack/Frontend reopen; vertical-slice plan written; initial JS budget raised to 280k pending measure |
| 2026-07-25 | Phase 11 in progress: floor domain, OPEN_DAY FloorDay, station compose/take-orders/deliver, tap-to-move actors; fast suite 119; assets polish + measured budget still open |
| 2026-07-25 | Phase 11 vertical slice Done: adjacency set/clear + wrong-seat toast; distinct character frames; fast suite 126; measured initial JS gzip 173,070 (cap 280,000) |
| 2026-07-25 | Floor locomotion: world-space path lerp + RPG Urban 4-dir×3-frame walk cycle; integer 2× character scale; nav no longer cancelled on every floor clone; fast suite 128 |
| 2026-07-25 | Approach A: network-first PWA shell/JS; slower walk + dest marker; 32×32 NN character atlas + 64px player draw; reused actor sprites; fast suite green |
| 2026-07-26 | Overnight program design (locked north star); Track A Done: cozy generated restaurant art + warm UI; fast suite 131; gzip 179,236 |
| 2026-07-26 | Track B Done: carry plate, door wait/leave ticks, interact adjacency hints, soft camera follow; fast suite 133 |
| 2026-07-26 | Track C Done: mid-day review Continue, FLOOR_/OPEN_DAY autosave, summary mastery + Shop/Floor CTAs, tutorial close step; fast suite 144 |
| 2026-07-26 | Track D Done: mastery on serve reviews + recipe-book progress labels + pacing HUD; fast suite 147 |
| 2026-07-27 | Edit catalog + achievements Done: prestige-flat purchase costs, decor buy/place (+ catalog), celebration banners, Recipe Book Achievements tab + badges; fast suite 280 |

---

## Cross-References

- Implementation plan detail: [Plan.md](./Plan.md)
- Overnight program: [design](./superpowers/specs/2026-07-26-cozy-restaurant-professional-program-design.md), [A](./superpowers/plans/2026-07-26-track-a-visual-identity.md), [B](./superpowers/plans/2026-07-26-track-b-service-immersion.md), [C](./superpowers/plans/2026-07-26-track-c-loop-completeness.md), [D](./superpowers/plans/2026-07-26-track-d-meta-depth.md)
- Immersive floor: [design](./superpowers/specs/2026-07-25-immersive-floor-service-design.md), [vertical-slice plan](./superpowers/plans/2026-07-25-immersive-floor-vertical-slice.md)
- Known risks: [Error-Tracker.md](./Error-Tracker.md)
- Product requirements: [PRD.md](./PRD.md)
