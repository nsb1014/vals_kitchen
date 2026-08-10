# AAA Art Direction Critique — Visual Identity, Rendering, Animation & Juice

**Slice:** Room/furniture/character art cohesion, canvas rendering layers, lighting/color/atmosphere, animation richness (walk, carry, sit, door), particles/screen feedback/juice, camera polish, UI visual language & motion (CSS), audio-visual feedback coupling.  
**Method:** Blind side-by-side against **Overcooked! 2** (readability under pressure, squash & stretch, color language, celebratory juice), **Stardew Valley** (cozy pixel consistency, atmosphere), **Dead Cells / TMNT: Shredder's Revenge** (2D feedback density: particles, flashes, easings). Judgment based on live Playwright captures (2026-08-10, Vite dev `127.0.0.1:4183`) plus fenced code review.  
**Viewports exercised:** 390×844 (mobile-primary), 1280×800 (desktop).  
**Gameplay constraints respected:** No proposals to change PRD structural rules, economy, or bundle/atlases/audio budgets.

---

## Benchmark rationale

| Benchmark | What we borrow | Relevance to Val's Kitchen |
|-----------|----------------|----------------------------|
| **Overcooked! 2** | High-contrast station color language, squash/stretch locomotion, confetti/star bursts on success, immediate “you did it” feedback | Floor service is spatial and concurrent; players need peripheral success/failure reads without reading text |
| **Stardew Valley** | Cohesive tile+character scale, warm interior palette, subtle ambient life (lamps, shadows, seasonal tint) | Val's targets the same “cozy management” register with wood-forward interiors and chibi cast |
| **Dead Cells / TMNT: SR** | Particle density, hit-stop flashes, eased UI pops, motion that sells every input | Sets the bar for **feedback per action** even without combat — serves, reviews, and pickups should “spark” |

Val's already invests in authored CC0 chibi atlases, Y-sorted depth, and doorway crop masks. Benchmarks still lead on **motion selling** and **celebration amplitude** — areas with headroom inside atlas (~2.1M / 4M) and JS budget.

---

## Evidence (screenshots)

All paths under `/tmp/aaa-shots/visual/`:

| Moment | Mobile (390×844) | Desktop (1280×800) |
|--------|------------------|---------------------|
| Floor empty (between days) | `01-floor-empty-mobile.png` | `01-floor-empty-desktop.png` |
| Floor in service (guest waiting) | `02-floor-in-service-mobile.png` | `02-floor-in-service-desktop.png` |
| Cooking / compose open | `03-cooking-open-mobile.png` | `03-cooking-open-desktop.png` |
| Review moment | `04-review-moment-mobile.png` | `04-review-moment-desktop.png` |
| Day summary | `05-day-summary-mobile.png` | `05-day-summary-desktop.png` |
| Shop (layout catalog) | `06-shop-mobile.png` | `06-shop-desktop.png` |
| Rating (HUD detail expand) | `07-rating-mobile.png` | `07-rating-desktop.png` |
| Four-facing seated guests | `08-four-facing-guests-mobile.png` | `08-four-facing-guests-desktop.png` |
| Celebration enqueue (fixture) | `09-celebration-mobile.png` | `09-celebration-desktop.png` |

**Code-backed motion not frozen in stills:** doorway guest crop + door sprite swap (`ActorLayer.doorwayGuestCropFraction`, `GridLayer` door state), room transition canvas fade (`RestaurantApp.runRoomTransition`), walk cycle `[0,1,0,2]` (`NavController.WALK_FRAME_SEQUENCE`), interact-hint pulse (`InteractHintLayer`).

**Capture notes:** `09-celebration-*` shows the tutorial notice (“Plate a ticket…”) rather than the mastery banner — celebration queue timing overlapped floor pacing copy. Doorway mid-transition still not captured (e2e `startServiceAndCaptureGuestDoorwayFrame` requires pre-start-service DOM); continuity is covered by `tests/e2e/doorway-transition-continuity.spec.ts`.

**Dead / static moments observed:**

- Between-day floor (`01`): no ambient animation (lamps static, no NPC idle bob, no UI parallax).
- In-service idle (`02`, `08`): characters hold single walk frame 0; no eating animation visible at table.
- Post-serve review (`04`): numeric stars + text only; canvas guests frozen behind sheet.
- Carry state: authored carry poses exist in atlas, but fallback plate is plain `Graphics` ellipses (`carry-plate.ts`) when carry texture missing.

---

## Blind scorecard (1 = poor, 5 = excellent)

| Category | OC2 | Stardew | Dead Cells / TMNT | Val's | Verdict vs benchmarks | One-line evidence |
|----------|:---:|:-------:|:-----------------:|:-----:|:---------------------:|-------------------|
| **Art cohesion** (room / furniture / character) | 5 | 5 | 4 | **3.5** | **Below** cozy leaders | Chibi cast + wood tiles + station art align (`01`, `08`); carry plate fallback ellipses and flat HUD icons break pixel craft. |
| **Palette & lighting atmosphere** | 5 | 5 | 4 | **3** | **Below** | Warm DOM tokens (`--vk-wood`, `--vk-accent`) match floor (`global.css`, `GridLayer`); canvas is evenly lit — no vignette, lamp pools, or time-of-day wash. |
| **Animation richness & transitions** | 5 | 4 | 5 | **3** | **Below** | Walk/sit/door crop implemented (`GuestMotion`, `ActorLayer`); screenshots show static poses; no squash, eating loops, or station idle. |
| **Success / failure feedback (juice)** | 5 | 3 | 5 | **2** | **Well below** | Review is stars + copy (`04`); no screen flash, bounce, or floor reaction on serve/deliver. |
| **Particle & effects presence** | 5 | 3 | 5 | **1** | **Far below** | No Pixi particle layer; only `InteractHintLayer` sine pulse and room fade (`RestaurantApp`). |
| **Scene readability under play** | 5 | 4 | 4 | **4** | **Near OC2 / above Stardew** | High contrast wood vs cream kitchen zone, clear character silhouettes (`02` desktop); tutorial banner + green CTA read well. |
| **UI motion & polish (CSS)** | 4 | 4 | 5 | **3** | **Below TMNT, near Stardew** | `banner-enter`, `ticket-arrive`, `service-panel-enter` exist; panels mostly static once open; no staggered list motion. |
| **Audio–visual coupling** | 4 | 3 | 4 | **2** | **Below** | `audio-bridge.ts` fires SFX on serve/review/placement; no linked canvas flash, HUD pulse, or haptic-adjacent UI scale. |
| **Screen celebrations & rewards** | 5 | 4 | 5 | **2.5** | **Below** | Celebration banner markup + kind variants (`CelebrationBanner.ts`, `global.css`); no confetti, star shower, or rating bar tween in captures. |
| **Visual distinctiveness / identity** | 4 | 5 | 4 | **3.5** | **Slightly below Stardew** | Recognizable “Val's diner” wood+chibi (`01`); layout reads generic sim — limited decor life, no signature color accent on floor. |
| **Camera polish** | 4 | 4 | 4 | **3** | **Below** | Smooth follow lerp (`Camera.followWorldPointSmooth`); fixed scale, no serve zoom/punch, no subtle drift while idle. |

**Roll-up:** Val's is **competitive on readability** and has **solid authored art foundations**, but trails all three benchmarks on **juice density**, **atmospheric lighting**, and **motion that sells actions**. Closest peer gap is Overcooked's celebratory feedback, not pixel resolution.

---

## Ranked gaps (severity × player impact)

| Rank | Gap | Severity | Evidence |
|:----:|-----|----------|----------|
| 1 | No canvas particle / burst layer for gameplay beats | High | Zero particle systems in `src/canvas/`; serve/review/delivery are silent visually (`04`, code grep). |
| 2 | Flat lighting — no ambient warmth or depth cues on floor | High | `GridLayer` alternates floor_a/floor_b only; no overlay tint, shadows, or lamp pools (`01`, `02`). |
| 3 | Carry / plate read uses vector fallback | Medium | `carry-plate.ts` + `ActorLayer.syncCarryPlate` draw ellipses, not food atlas (`Graphics` fill `0xf5e6c8`). |
| 4 | Action moments lack screen-space punch | Medium | Review/summary sheets are text + static stars (`04`, `05`); no CSS/ canvas flash on `playSfx('review')`. |
| 5 | Character idle / eating animation absent in play | Medium | Seated guests static in `08`; eating tick exists in domain but no visible chew loop on canvas. |
| 6 | Celebration amplitude low vs banner copy | Medium | `enqueueCelebration` fixture overlapped by notice (`09`); banner is slide-in only (`banner-enter` 180ms). |
| 7 | Canvas `image-rendering: auto` softens pixel crispness | Low | `global.css` `.restaurant-canvas` vs Frontend Guidelines integer pixel intent. |
| 8 | Audio fires without visual echo | Low | `audio-bridge.ts` SFX hooks only; no `RestaurantApp` subscriber for paired juice. |

---

## Concrete opportunities (implementable inside fence)

### 1. Add lightweight `EffectsLayer` for bursts (M)

| | |
|---|---|
| **What** | Pixi `Container` above `actorLayer` spawning short-lived sprites (star, steam puff, coin) on serve, review, and placement events. |
| **Why / player impact** | Closes the largest gap vs Overcooked/TMNT — players **feel** serves and reviews without reading. |
| **Where** | New `src/canvas/layers/EffectsLayer.ts`; wire from `RestaurantApp` store subscription; optional 16×16 burst frames in `scripts/build-chibi-ui-assets.py` + `pack-atlas.py` → `tiles` or new `fx` atlas slice in `public/assets/`. |
| **Complexity** | M |
| **Locked-rule risk** | Low — stay within atlas budget; pool + reuse sprites. |

### 2. Audio–visual bridge: SFX moments trigger canvas HUD flash (S)

| | |
|---|---|
| **What** | Extend `attachAudioBridge` to emit a tiny internal event bus (or callback registered by `RestaurantApp`) when `playSfx('serve' \| 'review' \| 'placement')` runs; canvas applies 80–120ms white/gold full-viewport alpha fade or scale punch on world container. |
| **Why / player impact** | Couples Kenney audio to motion — benchmark expectation that sound never fires alone. |
| **Where** | `src/app/audio-bridge.ts`; `RestaurantApp.ts` `mount` hook; optional CSS `@keyframes sfx-flash` on `#canvas-mount` in `global.css`. |
| **Complexity** | S |
| **Locked-rule risk** | None |

### 3. Replace carry plate ellipses with atlas plate + ticket icon (S–M)

| | |
|---|---|
| **What** | Swap `carryPlateGeometry` + `Graphics` fills for a small `Sprite` (plate frame from furniture atlas) + `food` icon from `food` atlas keyed by carried ticket's top ingredient. |
| **Why / player impact** | Carry state readable at periphery like Overcooked plates; removes vector “placeholder” look. |
| **Where** | `src/canvas/world/carry-plate.ts`, `ActorLayer.syncCarryPlate`, `src/assets/loader.ts` `getFoodTexture`. |
| **Complexity** | S–M |
| **Locked-rule risk** | None — uses existing atlases |

### 4. Ambient floor atmosphere pass (S)

| | |
|---|---|
| **What** | Semi-transparent `Graphics` or tiled gradient overlay on `GridLayer.view` (warm center vignette, slightly cooler kitchen annex); optional slow sine on overlay alpha. |
| **Why / player impact** | Stardew-like coziness without reauthoring tiles; separates dining vs kitchen zones beyond checkerboard. |
| **Where** | `src/canvas/layers/GridLayer.ts` or child overlay in `RestaurantApp` world stack. |
| **Complexity** | S |
| **Locked-rule risk** | None |

### 5. Celebration banner confetti + icon pop (S)

| | |
|---|---|
| **What** | CSS pseudo-element confetti fall on `.celebration-banner-mastery` / `-prestige`; staggered `animation` on `.celebration-banner-icons img` (scale pop 220ms `cubic-bezier`). |
| **Why / player impact** | Makes mastery/prestige moments screenshot-worthy; matches Dead Cells reward density in DOM-safe way. |
| **Where** | `src/ui/styles/global.css` (`@keyframes confetti-fall`, `icon-pop`); respects `prefers-reduced-motion` like existing banners. |
| **Complexity** | S |
| **Locked-rule risk** | None |

### 6. Walk-cycle squash on step (M)

| | |
|---|---|
| **What** | When `NavController.walkFrame()` advances, briefly scale actor sprite `scale.y` 0.92→1.0 over 60ms (player + guests). |
| **Why / player impact** | Overcooked-adjacent locomotion juice; cheap vs new frames. |
| **Where** | `ActorLayer` player/guest sprite sync; optionally factor easing in `NavController.walkFrame`. |
| **Complexity** | M |
| **Locked-rule risk** | None — cosmetic |

### 7. Doorway enter/exit puff + door bounce (M)

| | |
|---|---|
| **What** | On `doorwayGuestCropFraction` crossing thresholds, spawn 3–4 dust pixels at door cell; 1-frame door `scale.y` squash when `guestDoorOpen` toggles. |
| **Why / player impact** | Sells already-built doorway crop tech (`ActorLayer` mask) to players who don't read debug hooks. |
| **Where** | `GridLayer` door sprite sync; `EffectsLayer` (opp #1) or inline `Graphics` burst in `ActorLayer`. |
| **Complexity** | M |
| **Locked-rule risk** | None |

### 8. Enforce pixelated canvas scaling (S)

| | |
|---|---|
| **What** | Set `.restaurant-canvas { image-rendering: pixelated; }` (with `-webkit-optimize-contrast` fallback) to match PRD/Tech-Stack integer scaling intent. |
| **Why / player impact** | Sharper chibi on high-DPR phones; aligns DOM ingredient icons with floor art. |
| **Where** | `src/ui/styles/global.css` `.restaurant-canvas` |
| **Complexity** | S |
| **Locked-rule risk** | None — visual only |

### 9. Table “eating” surface micro-animation (M)

| | |
|---|---|
| **What** | When guest `stage === 'eating'`, alternate table overlay sprite or subtle steam puff above `tableServiceVisualStates` occupied tables. |
| **Why / player impact** | Breaks static seated tableau (`08`); communicates progress without UI. |
| **Where** | `FurnitureLayer.drawSprite` table branch; `table-service-visual.ts`; optional steam frame in `scripts/build-chibi-ui-assets.py`. |
| **Complexity** | M |
| **Locked-rule risk** | None |

### 10. Camera serve micro-zoom (S)

| | |
|---|---|
| **What** | On `SERVE_DISH` dispatch, 150ms ease `camera.state.scale` +4% then restore (clamped). |
| **Why / player impact** | TMNT-style hit punctuation; draws eye to delivery cell. |
| **Where** | `RestaurantApp` store listener; `Camera` helper `punchScale(delta, ms)`. |
| **Complexity** | S |
| **Locked-rule risk** | Low — keep clamp math in `coordinates.ts` |

---

## Asset & pipeline notes (read-only)

- `public/assets/CREDITS.json` honestly records project-generated CC0 chibi UI, tiles, guests, and Kenney audio — maintain this if adding FX sprites via `scripts/build-chibi-ui-assets.py`.
- Atlases measured ~2.1M / 4M — room for a small `fx` sheet (16×16 bursts, steam, dust) without budget risk.
- `item-colors.ts` fallback tints (`0x666688`) remain for missing furniture textures — prefer atlas completion over tint in production art pass.

---

## Summary verdict

Val's Kitchen has **credible cozy pixel identity** and **clear floor readability**, with **non-trivial animation infrastructure** (walk cycles, doorway mask, room fade, depth sort) that benchmarks would still animate harder in play. The slice's largest deficit is **feedback density**: particles, coupled audio-visual punches, and celebratory motion trail Overcooked, Stardew's atmosphere, and brawler-style UI juice. Highest ROI inside the fence: **EffectsLayer + audio-visual bridge** (M), **carry plate atlas swap** (S), **global.css celebration/canvas pixel polish** (S).

## Implemented (round 1)

| Opp # | Status | Notes |
|------:|--------|-------|
| 1 EffectsLayer bursts | Done | `EffectsLayer` + `fx_star/steam/coin/dust` in tiles atlas; wired on serve/review/placement juice + doorway dust + eating steam |
| 2 Audio–visual bridge | Done | `visual-juice.ts` bus; `audio-bridge` emits on serve/review/placement and wires `playDeliverSting` (SFX + juice, clears flag); canvas mount CSS flash + camera punch |
| 3 Atlas carry plate | Done (additive) | Generated `carry_plate` furniture frame + `CarryPlateLayer` covering Graphics fallback when `plateOverlayVisible`; food atlas now loaded via `getFoodTexture`. Did not edit `world/ActorLayer` / `carry-plate.ts` (fence) |
| 4 Ambient atmosphere | Done | `AtmosphereLayer` warm vignette + kitchen wash with slow alpha breathe |
| 5 Celebration confetti / icon-pop | Done | `global.css` confetti-fall + icon-pop; respects `prefers-reduced-motion` |
| 6 Walk squash | Skipped | Requires `ActorLayer` / `NavController` in `world/` (owned by concurrent agent) |
| 7 Doorway puff + door bounce | Done | Dust via EffectsLayer on door open; `GridLayer` door height squash bounce |
| 8 Pixelated canvas | Done | `.restaurant-canvas { image-rendering: pixelated }` |
| 9 Table eating micro-anim | Partial | Steam puffs over eating tables via EffectsLayer + `eatingTablePlacementIds` (no FurnitureLayer overlay swap — kept additive) |
| 10 Camera serve micro-zoom | Done | `cameraPunchMultiplier` / `clampCameraPunchScale` in `coordinates.ts`; punch on serve juice |

**Assets:** regenerated chibi FX + carry plate; `npm run build:assets` refreshes atlases + CREDITS (project-generated CC0).

## Implemented (round 2)

| Gap / task | Status | Notes |
|-----------:|--------|-------|
| Walk squash & stretch | Done | `ActorLayer` ±5% / 70ms walk-frame squash; feet planted via bottom anchor; Val + guests. |
| Eating / idle canvas loops | Done | Idle bob/breathe for waiting/seated/ordered; eating chew scale/translate; doorway suppresses bob. |
| Particle amplitude | Done | Denser/longer bursts; larger steam/dust scales; pooled ticker (no per-frame alloc). |
| Pixelated canvas regression | Done | Removed trailing `image-rendering: auto`; `pixelated` + `crisp-edges`. |
| Celebration vs tutorial notice | Done | `column-reverse` stack with gap; host z=80 above tutorial pulse. |
| Door dust / steam readability | Done | 24×24 higher-contrast FX frames + spawn scale/count lift. |

**Assets:** FX-only chibi build + tiles atlas repack; CREDITS honesty for 24×24 CC0 FX.
**Tests:** `src/test/visual-r2.test.ts`.
