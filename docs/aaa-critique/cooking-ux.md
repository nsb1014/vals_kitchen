# AAA UX Critique — Cooking, Tickets & Pantry

**Slice:** Compose lifecycle, pantry/ingredient selection, ticket presentation (Order/Ideal), dish preview, order bubbles, floor service HUD, carry/plating state, flavor inspector.  
**Method:** Blind side-by-side against **Cook, Serve, Delicious! 3** (ticket readability, station flow, prep feedback) and **Overcooked! 2** (order iconography under pressure). Judgment based on live Playwright session (2026-08-10) plus code review of fenced presentation files.  
**Viewports exercised:** 390×844 (mobile-primary), 1280×800 (desktop).  
**Gameplay constraints respected:** No proposals to change PRD structural rules, economy, or bundle budgets.

---

## Benchmark rationale

| Benchmark | What we borrow | Relevance to Val's Kitchen |
|-----------|----------------|----------------------------|
| **CSD3** | Ticket legibility at a glance, station-to-plate feedback loops, ingredient discovery while cooking | Closest genre peer: order → prep → plate → serve, but Val's replaces recipe steps with 16-axis flavor matching |
| **Overcooked! 2** | Icon-first orders, color/status at periphery, zero reading under load | Stress-tests scannability; Val's has no timers but concurrent tickets (max 4) create comparable attention splits |

Val's deliberately removes time pressure (no patience meters). Comparisons therefore weight **clarity and state communication** over urgency affordances, while still holding the UI to benchmark-grade **at-a-glance** ticket reading.

---

## Evidence (screenshots)

All paths under `/tmp/aaa-shots/cooking/`:

| Step | Mobile (390×844) | Desktop (1280×800) |
|------|------------------|---------------------|
| Floor service start | `mobile-390x844-01-floor-service.png` | `desktop-1280x800-01-floor-service.png` |
| Order bubble after take-order | `mobile-390x844-02-order-bubble.png` | `desktop-1280x800-02-order-bubble.png` |
| Tickets — Order tab | `mobile-390x844-03-tickets-order.png` | `desktop-1280x800-03-tickets-order.png` |
| Tickets — Ideal tab | `mobile-390x844-04-tickets-ideal.png` | `desktop-1280x800-04-tickets-ideal.png` |
| Compose sheet (empty) | `mobile-390x844-05-compose-initial.png` | `desktop-1280x800-05-compose-initial.png` |
| Axis filter applied | `mobile-390x844-06-compose-filtered.png` | `desktop-1280x800-06-compose-filtered.png` |
| Partial selection (3/6) | `mobile-390x844-07-compose-partial.png` | `desktop-1280x800-07-compose-partial.png` |
| Flavor inspector modal | `mobile-390x844-08-flavor-inspector.png` | `desktop-1280x800-08-flavor-inspector.png` |
| Flavor details expanded (mobile) / selection (desktop) | `mobile-390x844-09-compose-flavor-details.png` | `desktop-1280x800-09-compose-with-selection.png` |
| Post-plate carry state | `mobile-390x844-10-post-plate-carry.png` | `desktop-1280x800-10-post-plate-carry.png` |
| Carrying in tickets menu | `mobile-390x844-11-carrying-ticket.png` | `desktop-1280x800-11-carrying-ticket.png` |
| Post-deliver | `mobile-390x844-12-post-deliver.png` | `desktop-1280x800-12-post-deliver.png` |

**Observed confusion moments during live run:**

1. **Order vs Ideal split** — Preference prose appears in Order tab, bubble, and compose header; numeric Ideal profile is a second tab. Players must discover Ideal for witness targets (`mobile-390x844-03` vs `04`).
2. **Mobile axis filter hides the pantry** — Selecting "Low Salty" collapses the grid to a single matching ingredient (`mobile-390x844-06`), with no visible search or "show all" escape hatch.
3. **Floor actions under compose sheet** — Set table / Seat guest buttons remain visible beneath the modal (`mobile-390x844-05`), suggesting actions that are blocked by overlay isolation.
4. **Ideal panel truncation on mobile** — Aroma/Mouthfeel axes clip below the fold in tickets Ideal view (`mobile-390x844-04`, `11`).
5. **Carry feedback inconsistency** — Desktop shows deliver toast + plated sprite (`desktop-1280x800-10`); mobile carry shot lacked toast, only toggle text (`mobile-390x844-10`).
6. **No text search** — 100 unlocked ingredients in fixture; discovery is scroll + one axis chip only despite `.compose-search-*` CSS existing unused.

---

## Blind scorecard (1 = poor, 5 = excellent)

| Category | CSD3 | OC2 | Val's | Verdict vs benchmarks | One-line evidence |
|----------|:----:|:---:|:-----:|:---------------------:|-------------------|
| **Ticket scannability** | 5 | 5 | 3 | **Below** | Prose-only prefs ("High Umami, low Salty…") in bubble + Order tab; no icons or step glyphs like CSD/OC order cards. |
| **Flavor-gap communication** | 2 | 1 | 4 | **Above** | Compose target/dish dual bars + "In range / Below request" chips update live (`05`, `09`); benchmarks lack this mechanic. |
| **Ingredient findability** | 4 | 3 | 2 | **Below** | 100-item grid with axis-only filter; no wired search (`compose-pantry.ts`); mobile hides non-requested axis chips (`service-day.css` ≤760px). |
| **Compose flow friction** | 4 | 4 | 3 | **Below** | Full blocking sheet to cook; close required to walk; instant plate (no prep beats) vs CSD tactile station loop. |
| **Error prevention & recovery** | 4 | 3 | 3 | **At** | 3–6 cap + disabled Plate enforced; carrying locks ticket selection (`floor-ticket-panel.ts`); filter can empty pantry with only "No ingredients match" copy. |
| **Progress feedback while cooking** | 5 | 4 | 3 | **Below** | Strong flavor meters but no chop/sizzle/timer cadence; selection changes lack micro-confirmation beyond bar nudge. |
| **Information hierarchy @ 390px** | 4 | 5 | 3 | **Below** | Compose stacks order meters + 5-col pantry + footer CTAs; Ideal tab truncates lower flavor groups; filter summary hidden on mobile. |
| **One-handed mobile usability** | 3 | 4 | 3 | **At** | Plate CTA bottom-right (good); axis chips and pantry scroll compete for thumb zone top/middle; inspect "i" is 44px but visually de-emphasized. |
| **Carry / plating state visibility** | 4 | 5 | 3 | **Below** | Toggle text "Carrying …" + ticket row status; deliver toast on desktop only in run; canvas plate visible on desktop, not obvious on mobile shot. |
| **Cognitive load (multi-ticket)** | 4 | 5 | 2 | **Below** | Single compose subject; other tickets only in collapsed dock; no cross-ticket priority or icon strip while cooking. |

**Roll-up:** Val's is **above** benchmarks on flavor-gap communication (core differentiator), **at** on error prevention and one-handed basics, **below** on scannability, findability, prep feedback, hierarchy, carry visibility, and multi-ticket load.

---

## Ranked gaps (severity × frequency)

| Rank | Gap | Severity | Evidence |
|:----:|-----|----------|----------|
| 1 | No pantry text search at 100 ingredients | High | CSS stubs exist (`service-day.css` `.compose-search-row`) but `ServiceDayUi.ts` never renders search; scroll-only in `05`. |
| 2 | Mobile filter can collapse pantry to near-zero | High | `06-compose-filtered` shows 1 match for "Low Salty"; `compose-pantry.ts` band logic + mobile chip hiding. |
| 3 | Ticket information triplicated without hierarchy | Medium | Same prose in bubble, Order tab, compose header (`02`, `03`, `05`). |
| 4 | Ideal profile incomplete in tickets panel on mobile | Medium | Aroma clipped (`04`, `11`); full scroll host is `.floor-tickets-panel-body` but content height exceeds viewport. |
| 5 | Multi-ticket context absent during compose | Medium | Only active ticket in compose order panel; dock closed by default. |
| 6 | Carry state easy to miss on mobile | Medium | `10` lacks deliver toast; HUD relies on small toggle string (`FloorServiceHud.ts` `toggleText`). |
| 7 | Order bubble ephemeral (2.4s) | Low | `ServiceDayUi.ts` `orderBubbleTimer`; easy to miss if player looks at station. |
| 8 | Floor chrome visible under modal | Low | Ghost CTAs under compose (`05`); isolated via `inert` but still visual noise. |

---

## Concrete opportunities (implementable in fence)

### 1. Wire pantry text search (S)

| | |
|---|---|
| **What** | Add name search field above axis chips; filter `filterComposePantry` results by case-insensitive substring. |
| **Why / player impact** | Cuts scroll fatigue for 100 ingredients; matches CSD ingredient lookup expectation. |
| **Where** | `ServiceDayUi.ts` compose render (~1061); extend `compose-pantry.ts` with `searchQuery` in `ComposePantryFilterState`; reuse existing `.compose-search-*` in `service-day.css`. |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 2. Safe filter UX — "All ingredients" chip + match count on mobile (S)

| | |
|---|---|
| **What** | Always show a `data-compose-all` chip on mobile; restore `compose-filter-summary` on narrow viewports; when filter yields &lt;5 matches, show inline hint to clear filter. |
| **Why** | Prevents dead-end pantry (`06`); recoverable mistake without closing sheet. |
| **Where** | `ServiceDayUi.ts` axis chip row; `compose-pantry.ts` summary helper; `service-day.css` mobile rules (~1568–1574). |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 3. Compose mini ticket rail for active queue (M)

| | |
|---|---|
| **What** | Horizontal strip of guest portraits + status (open/plated/carrying) pinned under compose header; tap switches `selectedTicketId` when not carrying. |
| **Why** | Reduces multi-ticket memory load; OC-style peripheral order awareness. |
| **Where** | New `src/ui/presentation/compose-ticket-rail.ts`; render from `ServiceDayUi.ts` using `buildFloorTicketPanelViewModel` rows. |
| **Complexity** | M |
| **Locked-rule risk** | No |

### 4. Unify ticket copy hierarchy — shorten Order, elevate Ideal cues (S)

| | |
|---|---|
| **What** | Order tab: guest + 1-line phrase chips (parsed from `formatCustomerRequestText`); move full prose to expandable detail; default tickets menu to Ideal when first opened after take-order. |
| **Why** | Faster scan vs CSD ticket headers; reduces triplication fatigue. |
| **Where** | `floor-ticket.ts`, `FloorServiceHud.ts` row template, `customer-request.ts` phrase splitter. |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 5. Flavor-gap meter polish — band shading + delta readout (S)

| | |
|---|---|
| **What** | Shade target band on compose request bars; optional `+1.2` delta next to status label when below/above. |
| **Why** | Makes "how much more Umami?" answerable without mental math; strengthens above-benchmark gap comms. |
| **Where** | `ServiceDayUi.ts` `compose-request-axis` template; `service-day.css` `.compose-request-bar`; helper in `dish-preview.ts` or new `compose-request.ts`. |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 6. Strengthen carry / deliver affordances in HUD (S)

| | |
|---|---|
| **What** | When `carriedTicketId` set: accent border on tickets toggle, append "→ deliver" in `toggleText`, auto-open tickets menu on first carry with Carrying row highlighted. |
| **Why** | Mobile run missed deliver toast; OC-level state clarity at HUD edge. |
| **Where** | `floor-ticket-panel.ts`, `FloorServiceHud.ts`, `service-day.css` `.floor-tickets-toggle.carrying`. |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 7. Ideal tab scroll affordance on mobile (S)

| | |
|---|---|
| **What** | Fade mask + "Scroll for aroma" hint when `floor-tickets-ideal` content overflows; ensure `flavor-group` sections use compact spacing in dock. |
| **Why** | Fixes clipped Aroma in `04`/`11`; players miss half the scoring witness. |
| **Where** | `FloorServiceHud.ts` ideal body wrapper; `flavor-profile.ts` `renderFlavorBarsHtml`; `service-day.css` `.floor-tickets-ideal`. |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 8. Extend order bubble life + dismiss on compose open (S)

| | |
|---|---|
| **What** | Lengthen bubble to 5s or until compose sheet opens; add subtle pulse on first ticket. |
| **Why** | Bridges take-order → walk-to-station; CSD keeps ticket pinned until served. |
| **Where** | `ServiceDayUi.ts` `orderBubbleTimer`; `order-bubble.ts` ownership rules. |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 9. Inspector entry discoverability in compose (S)

| | |
|---|---|
| **What** | First-visit coach mark on inspect button; long-press hint in `compose-filter-summary`; optional "compare to request" highlight axes where ingredient exceeds requested band. |
| **Why** | Long-press (450ms) is hidden; inspector is critical for 16-axis literacy. |
| **Where** | `FlavorInspectorScreen.ts` modal copy; `ServiceDayUi.ts` long-press path; `flavor-profile.ts`. |
| **Complexity** | S |
| **Locked-rule risk** | No |

### 10. Regression tests for cooking UX chrome (M)

| | |
|---|---|
| **What** | `src/test/cooking-pantry-search.test.ts`, `cooking-ticket-rail.test.ts` — unit tests for filter/search view-models and ticket panel VM carry states. |
| **Why** | Locks mobile filter dead-end and search behavior without e2e flake. |
| **Where** | New test files per fence naming. |
| **Complexity** | M |
| **Locked-rule risk** | No |

---

## Summary verdict

Val's Kitchen cooking UX **excels at its unique flavor-gap loop** (compose order panel, live in-range chips, inspector depth) but **trails AAA service-game benchmarks on ticket scannability, ingredient discovery at scale, and multi-order peripheral awareness**. The highest-ROI fixes are **search + filter recovery** (already styled, not wired), **ticket rail during compose**, and **carry/deliver HUD emphasis** — all achievable within the presentation fence without touching locked gameplay numbers.

---

## Implemented (round 1)

### Shipped

| # | Opportunity | What / where | Tests |
|---|-------------|--------------|-------|
| 1 | Pantry text search | `compose-pantry.ts` `searchQuery` + `setComposeSearchQuery`; wired in `ServiceDayUi.ts` compose filters (input + Clear); reuse `.compose-search-*` (44px targets) | `src/test/cooking-pantry-search.test.ts` |
| 2 | Filter recovery | Always-on `data-compose-all` “All ingredients” chip; mobile match summary restored; `<5` match hint via `composePantryLowMatchHint`; CSS no longer hides `.compose-filter-summary` on narrow/short viewports | same |
| 3 | Compose mini ticket rail | New `compose-ticket-rail.ts`; portrait+status strip under compose header; tap switches `setFloorSelectedTicket` when selectable | `src/test/cooking-ticket-rail.test.ts` |
| 4 | Ticket copy hierarchy | `splitCustomerRequestPhrases` + `preferencePhrases` on floor ticket labels; Order tab shows phrase chips + expandable “Full request”; new tickets default Ideal tab | cooking-pantry-search (phrases) |
| 5 | Flavor-gap meters | New `compose-request.ts` band shade + delta; compose request bars shade accepted band and append `+N.N` when outside range; status kept visible on mobile | cooking-pantry-search |
| 6 | Carry / deliver HUD | Toggle gets `.carrying` accent + appended `→ deliver` in `FloorServiceHud.ts` (VM `toggleText` unchanged); auto-open Order menu on first carry; carrying row highlight CSS | cooking-ticket-rail |
| 7 | Ideal scroll affordance | Fade sticky “Scroll for aroma” hint when Ideal panel overflows; compact `.floor-tickets-ideal .flavor-group` spacing | visual / HUD render path |
| 8 | Order bubble life | Timer 2.4s → 5s; pulse class; still dismissed when compose/service overlay opens (existing ownership) | — |
| 10 | Regression tests | New `cooking-*.test.ts` files as above | vitest |

### Remaining gaps / skipped

| # | Status | Why |
|---|--------|-----|
| 9 | Skipped | Inspector coach mark / long-press discoverability needs first-visit persistence outside the presentation fence (`localStorage` UX flag + `FlavorInspectorScreen` copy alone is incomplete without store/tutorial wiring). Safer as a follow-up. |
| Floor chrome under modal | Not addressed | Ghost CTAs are already `inert`; visual dimming would need chrome/isolation changes bordering other agents’ slices. |

---

## Re-verification (round 1)

**Method:** Fresh blind re-score from live Playwright session (2026-08-10) against the same CSD3 / Overcooked! 2 benchmarks. Verified round-1 changelog claims at `http://127.0.0.1:4182/?e2e=1` via `window.__E2E__` bridge; code cross-check of presentation files. Screenshots: `/tmp/aaa-shots/cooking-verify/` (390×844 + 1280×800).

### Claim verification (round 1 changelog)

| # | Claim | Verified? | Evidence |
|---|-------|:---------:|----------|
| 1 | Pantry text search | **Yes** | `compose-search-input` visible on mobile (`05`) and desktop (`05`); `"chicken"` → `3 matching · "chicken"` (`06b`). |
| 2 | Filter recovery | **Yes** | `data-compose-all` “All ingredients” chip always visible (`05`/`06`); mobile `.compose-filter-summary` shows `84 matching · Low Salty` (`06`); All chip restores 100 items. Low-match hint not triggered at 84 matches (threshold `<5` in `composePantryLowMatchHint`). |
| 3 | Compose ticket rail | **Partial** | Rail renders under compose header (`05`, `13`) but live runs showed **1 item** only; multi-ticket fixture did not surface 2+ rail portraits. |
| 4 | Ticket copy hierarchy | **Yes** | New tickets default **Ideal** tab (`03`/`04`); Order tab uses phrase chips + “Full request” expander (`11`); bubble still full prose (`02`). |
| 5 | Flavor-gap meters | **Yes** | Band shade on request bars + delta readouts (`09` mobile: `Above request · +1.0`; desktop `06`: `Below request · +6.0`). |
| 6 | Carry / deliver HUD | **Yes** | Toggle `.carrying` + `→ deliver` (`10` desktop, `12` mobile); deliver toast; tickets menu auto-opens with `.carrying` row (`10`/`11`); desktop plate sprite on player (`10`). |
| 7 | Ideal scroll affordance | **Yes** | Sticky “Scroll for aroma” hint visible when Ideal overflows (`03`/`04`); aroma axes still below fold. |
| 8 | Order bubble life | **Partial** | Bubble visible post take-order (`02`); timed out before second capture in one run — 5s extension not stress-tested. |
| 9 | Inspector discoverability | **Skipped** | Long-press opens inspector (`08`) but no coach mark; 450ms affordance still hidden. |
| 10 | Regression tests | **Yes** | `cooking-pantry-search.test.ts`, `cooking-ticket-rail.test.ts` present (not re-run full suite). |

### Evidence (screenshots)

All paths under `/tmp/aaa-shots/cooking-verify/`:

| Step | Mobile (390×844) | Desktop (1280×800) |
|------|------------------|---------------------|
| Floor service start | `mobile-390x844-01-floor-service.png` | `desktop-1280x800-01-floor-service.png` |
| Order bubble after take-order | `mobile-390x844-02-order-bubble.png` | `desktop-1280x800-02-order-bubble.png` |
| Tickets — default view (Ideal) | `mobile-390x844-03-tickets-order.png` | `desktop-1280x800-03-tickets-order.png` |
| Tickets — Ideal tab + scroll hint | `mobile-390x844-04-tickets-ideal.png` | `desktop-1280x800-04-tickets-ideal.png` |
| Compose sheet (empty) | `mobile-390x844-05-compose-initial.png` | `desktop-1280x800-05-compose-initial.png` |
| Axis filter applied | `mobile-390x844-06-compose-filtered.png` | `desktop-1280x800-06-compose-filtered.png` |
| Pantry search | `mobile-390x844-06b-compose-search.png` | `desktop-1280x800-06b-compose-search.png` |
| Partial selection (3/6) | `mobile-390x844-07-compose-partial.png` | `desktop-1280x800-07-compose-partial.png` |
| Flavor inspector modal | `mobile-390x844-08-flavor-inspector.png` | `desktop-1280x800-08-flavor-inspector.png` |
| Flavor details / selection | `mobile-390x844-09-compose-flavor-details.png` | `desktop-1280x800-09-compose-with-selection.png` |
| Post-plate carry state | `mobile-390x844-10-post-plate-carry.png` | `desktop-1280x800-10-post-plate-carry.png` |
| Carrying in tickets menu | `mobile-390x844-11-carrying-ticket.png` | `desktop-1280x800-11-carrying-ticket.png` |
| Post-deliver attempt | `mobile-390x844-12-post-deliver.png` | `desktop-1280x800-12-post-deliver.png` |
| Multi-ticket compose rail | — | `desktop-1280x800-13-multi-ticket-rail.png` |

### Blind scorecard (re-score)

| Category | CSD3 | OC2 | Val's (r0) | Val's (r1) | Verdict vs benchmarks | One-line evidence |
|----------|:----:|:---:|:----------:|:----------:|:---------------------:|-------------------|
| **Ticket scannability** | 5 | 5 | 3 | **3** | **Below** | Phrase chips + Ideal-default help (`11`, `04`) but orders remain prose-only in bubble and side panel — no icon/step glyphs. |
| **Flavor-gap communication** | 2 | 1 | 4 | **5** | **Above** | Band-shaded targets + signed deltas (`09`, `06`); clearest differentiator in the slice. |
| **Ingredient findability** | 4 | 3 | 2 | **4** | **At** | Wired search + All-ingredients recovery; `84 matching` on axis filter vs prior 1-item dead-end (`06`). |
| **Compose flow friction** | 4 | 4 | 3 | **3** | **Below** | Full blocking sheet unchanged; walk-to-station still required to open compose. |
| **Error prevention & recovery** | 4 | 3 | 3 | **4** | **At** | 3–6 cap + carry lock intact; filter/search escape hatches verified (`06`, `06b`). |
| **Progress feedback while cooking** | 5 | 4 | 3 | **3** | **Below** | Live delta chips on bar movement (`09`) but no prep beats / station cadence. |
| **Information hierarchy @ 390px** | 4 | 5 | 3 | **3** | **Below** | Search + chips + meters + 5-col grid still stack heavily (`05`/`09`); aroma witness scroll-dependent (`04`). |
| **One-handed mobile usability** | 3 | 4 | 3 | **3** | **At** | Plate CTA anchored bottom-right (`09`); filter/search row competes in top thumb zone. |
| **Carry / plating state visibility** | 4 | 5 | 3 | **4** | **At** | `→ deliver` on toggle (`12`), auto-open tickets + CARRYING row (`10`/`11`), desktop toast + carry sprite (`10`). |
| **Cognitive load (multi-ticket)** | 4 | 5 | 2 | **2** | **Below** | Rail code ships but live compose never showed >1 portrait (`13`); queue memory still on collapsed dock. |

**Roll-up (r1):** Val's remains **above** on flavor-gap communication, **at** on findability, error prevention, one-handed basics, and carry visibility, **below** on scannability, compose friction, prep feedback, mobile hierarchy, and multi-ticket load.

### Verdict

**Does the slice meet or exceed the benchmark blind after round 1?** **No.** Round 1 closes the highest-ROI presentation gaps (search, filter recovery, carry emphasis, flavor deltas) and moves findability and carry from below → at benchmark. Scannability, tactile prep feedback, mobile density, and multi-ticket peripheral awareness still trail CSD3/OC2. Flavor-gap remains the sole category clearly **above** both peers.

### Remaining gaps (ranked)

| Rank | Gap | Where | Complexity |
|:----:|-----|-------|:----------:|
| 1 | Multi-ticket rail unproven under load (1 portrait in all live compose shots) | `compose-ticket-rail.ts` + e2e multi-order fixture | M |
| 2 | Ticket scannability still prose/icon-less vs CSD/OC order cards | `order-bubble.ts`, `floor-ticket.ts`, `customer-request.ts` | M |
| 3 | Inspector entry hidden (450ms long-press, no first-visit coach) | `ServiceDayUi.ts` long-press path, `FlavorInspectorScreen.ts` + store flag | S |
| 4 | Ideal aroma/mouthfeel still below fold on 390px despite hint | `FloorServiceHud.ts` ideal wrap, `flavor-profile.ts` | S |
| 5 | No station prep cadence / tactile cook loop | domain + canvas (outside presentation fence) | L |
| 6 | Floor action chrome visible under compose modal | `ServiceDayUi.ts` overlay isolation / dimming | S |
| 7 | Mobile compose vertical stack (search + chips + meters + grid) | `service-day.css` compose layout | M |

---

## Final verification (round 2)

**Method:** Fresh blind re-score from live Playwright session (2026-08-10) against CSD3 / Overcooked! 2. `npm run sync:data`; dev server `http://127.0.0.1:4182/?e2e=1` via `window.__E2E__` bridge (`tests/e2e/helpers.ts` pattern). Screenshots: `/tmp/aaa-shots/cooking-final/` (390×844 + 1280×800). Server killed after capture.

### Claim verification (round 2 changelog)

| # | Claim | Verified? | Evidence |
|---|-------|:---------:|----------|
| 1 | Sims-style gibberish order bubble (not literal taste prose in visual layer) | **Yes** | Mobile `02`: visual `"Sul sul! Doooh flib dag ah dowoobosh paxkepba v-igber!"`; `hasLiteralTasteProfile: false`. Real preference only in `.sr-only` (`Order: High Umami, low Salty…`). |
| 2 | Bubble ticket / axis cue iconography | **Yes** | `02`: `order-bubble-ticket-icon` + three `order-bubble-cue` chips (`Sa`/`Um`/`Pu`) with `data-axis` keys; desktop mirrors (`Um`/`Pu`/`Ri`). |
| 3 | Bubble SR summary in a11y tree | **Yes** | Bubble `role="status"`; `.sr-only` full request text present; visual layer `aria-hidden="true"`. |
| 4 | Hardened multi-ticket compose rail (2+ active) | **Yes** | `05`/`13`: `compose-ticket-rail--multi`, `data-rail-count="2"`, two portraits (`Balanced… SELECTED`, `Rich Indust… OPEN`) on mobile and desktop. |
| 5 | Pantry search + filter recovery | **Yes** | `06b`: `compose-search-input` + `3 matching · "chicken"` on **mobile** (search now wired at 390px); `06`: axis filter + `data-compose-all` chip; low-match hint in `09`. |
| 6 | Flavor-gap signed deltas | **Yes** | `09`: `Below request · +6.0`, `Above request · +0.8`; band shade via `.compose-request-band` in DOM. |
| 7 | Carry → deliver emphasis | **Yes** | `10`/`11`: toggle `Carrying … · 2/4 → deliver` + `.carrying`; tickets menu auto-open with `CARRYING` row highlight. |
| 8 | Inspector long-press discoverability hint | **Yes** | `05`/`09`: `compose-inspect-hint` under filter summary; `08`: `inspector-long-press-hint` inside flavor inspector modal. |
| 9 | Ideal aroma above fold | **Yes** | `04`: **Aroma** group first (before Basic Tastes); `aromaAboveFold: true`; hint now reads “Scroll for mouthfeel”. |
| 10 | Floor CTA in-flight shimmer | **Partial** | `FloorServiceHud.ts` applies `.in-flight` + `aria-busy` during **seat** walk (`seating` stage: confirmed in supplemental run). Instant actions (`set-table`, `take-orders`) clear shimmer in one microtask — not visible in `12` carry-state capture. |

**Gameplay-rule audit:** No violations observed. Plated dish used **3** ingredients (within 3–6); fixture held **2/4** tickets; Ideal panel shows **15** `[role="meter"]` axes.

### Evidence (screenshots)

All paths under `/tmp/aaa-shots/cooking-final/`:

| Step | Mobile (390×844) | Desktop (1280×800) |
|------|------------------|---------------------|
| Floor service start | `mobile-390x844-01-floor-service.png` | `desktop-1280x800-01-floor-service.png` |
| Order bubble (gibberish + cues) | `mobile-390x844-02-order-bubble.png` | `desktop-1280x800-02-order-bubble.png` |
| Tickets — default (Ideal) | `mobile-390x844-03-tickets-default.png` | `desktop-1280x800-03-tickets-default.png` |
| Tickets — Ideal (aroma first) | `mobile-390x844-04-tickets-ideal.png` | `desktop-1280x800-04-tickets-ideal.png` |
| Compose + 2-ticket rail | `mobile-390x844-05-compose-initial.png` | `desktop-1280x800-05-compose-initial.png` |
| Axis filter applied | `mobile-390x844-06-compose-filtered.png` | `desktop-1280x800-06-compose-filtered.png` |
| Pantry search | `mobile-390x844-06b-compose-search.png` | `desktop-1280x800-06b-compose-search.png` |
| Partial selection (3/6) | `mobile-390x844-07-compose-partial.png` | `desktop-1280x800-07-compose-partial.png` |
| Flavor inspector modal | `mobile-390x844-08-flavor-inspector.png` | `desktop-1280x800-08-flavor-inspector.png` |
| Flavor-gap deltas | `mobile-390x844-09-compose-flavor-details.png` | `desktop-1280x800-09-compose-flavor-details.png` |
| Post-plate carry state | `mobile-390x844-10-post-plate-carry.png` | `desktop-1280x800-10-post-plate-carry.png` |
| Carrying in tickets menu | `mobile-390x844-11-carrying-ticket.png` | `desktop-1280x800-11-carrying-ticket.png` |
| CTA in-flight (carry context) | `mobile-390x844-12-cta-in-flight.png` | `desktop-1280x800-12-cta-in-flight.png` |
| Multi-ticket compose rail | `mobile-390x844-13-multi-ticket-rail.png` | `desktop-1280x800-13-multi-ticket-rail.png` |

Machine-readable capture log: `/tmp/aaa-shots/cooking-final/evidence.json`.

### Blind scorecard (re-score)

| Category | CSD3 | OC2 | Val's (r1) | Val's (r2) | Verdict vs benchmarks | One-line evidence |
|----------|:----:|:---:|:----------:|:----------:|:---------------------:|-------------------|
| **Ticket scannability** | 5 | 5 | 3 | **4** | **At** | Gibberish bubble + ticket icon + axis cue chips (`02`); Order tab still phrase chips, not food glyphs. |
| **Flavor-gap communication** | 2 | 1 | 5 | **5** | **Above** | Signed deltas + band shade on compose meters (`09`); benchmarks lack this loop. |
| **Ingredient findability** | 4 | 3 | 4 | **4** | **At** | Search + All-ingredients + low-match hint at 390px (`06b`, `09`); 100-item grid still scroll-heavy. |
| **Compose flow friction** | 4 | 4 | 3 | **3** | **Below** | Full blocking sheet unchanged; walk-to-station gate intact. |
| **Error prevention & recovery** | 4 | 3 | 4 | **4** | **At** | 3–6 cap enforced; filter/search escape + “Few matches” hint (`09`). |
| **Progress feedback while cooking** | 5 | 4 | 3 | **3** | **Below** | Live delta chips on bar movement (`09`); no prep beats / station cadence. |
| **Information hierarchy @ 390px** | 4 | 5 | 3 | **4** | **At** | Aroma group above fold in Ideal (`04`); compose stack (search + chips + meters + grid) still dense (`05`). |
| **One-handed mobile usability** | 3 | 4 | 3 | **3** | **At** | Plate CTA bottom-right (`09`); top filter/search row competes for thumb reach. |
| **Carry / plating state visibility** | 4 | 5 | 4 | **4** | **At** | `→ deliver` toggle + auto-open CARRYING row (`10`/`11`); deliver toast on banner. |
| **Cognitive load (multi-ticket)** | 4 | 5 | 2 | **4** | **At** | Two-portrait compose rail with status (`05`/`13`); full queue still in dock when closed. |

**Roll-up (r2):** Val's is **above** on flavor-gap communication, **at** on scannability, findability, error prevention, hierarchy, carry visibility, one-handed basics, and multi-ticket awareness, **below** on compose friction and prep feedback.

### Verdict

**Does the slice meet or exceed the benchmark blind after round 2?** **No.** Round 2 closes the largest r1 regressions (multi-ticket rail, bubble iconography, aroma fold, inspector hints) and lifts scannability and multi-ticket load from below → at. The slice still trails CSD3/OC2 on tactile prep feedback and blocking compose friction; flavor-gap remains the only category clearly **above** both peers.

### Remaining gaps (ranked)

| Rank | Gap | Where | Complexity |
|:----:|-----|-------|:----------:|
| 1 | No station prep cadence / tactile cook loop | domain + canvas (outside presentation fence) | L |
| 2 | Compose blocking sheet + walk-to-station gate | `ServiceDayUi.ts` compose lifecycle | M |
| 3 | Instant floor CTA shimmer imperceptible (one microtask) | `FloorServiceHud.ts` `pendingFloorAction` release | S |
| 4 | Order tab / tickets still phrase chips vs OC food icons | `floor-ticket.ts`, `customer-request.ts` | M |
| 5 | Mobile compose vertical density (search + chips + meters + 5-col grid) | `service-day.css` compose layout | M |
| 6 | Floor action chrome visible under compose modal | `ServiceDayUi.ts` overlay dimming | S |
| 7 | Gibberish bubble hides literal prefs — cues help but require axis literacy | `order-bubble.ts`, `guest-gibberish.ts` | S |

---

## Implemented (round 3)

### Shipped

| # | Task | What / where | Tests |
|---|------|--------------|-------|
| 1 | Compose friction (keep lifecycle) | Dismiss scrim + Escape (existing) close sheet without clearing ticket drafts; mobile sheet ~78% so floor peeks; lighter scrim; dim inert floor chrome under compose (`ServiceDayUi.ts`, `service-day.css`) | visual `/tmp/aaa-shots/cooking-r3/` |
| 2 | CTA icons + persistent in-flight | Icon+label CTAs; ≥520ms hold (not microtask flash); seat holds through canvas `data-in-flight` + seating; deliver toggle gets icon + in-flight while carrying; reduced-motion override (`floor-action-feedback.ts`, `FloorServiceHud.ts`, CSS) | `cooking-r3-polish.test.ts` |
| 3 | Progress while cooking | Live 3–6 window meter + “flavors in range” coherence under Selected; footer mirrors coherence (`compose-progress.ts`) | same |
| 4 | Order tab icon-first | Axis cue chips (band glyph + short code) replace phrase chips; Ideal tab unchanged 15 axes (`floor-ticket.ts`, `FloorServiceHud.ts`) | same + `floor-ticket-label.test.ts` |
| 5 | HUD detail a11y | Detail popover `role="dialog"` + `aria-labelledby` / `aria-label`; trigger buttons `aria-haspopup` + `aria-controls` (`ServiceDayUi.ts`) | — |

### Skipped

| Gap | Why |
|-----|-----|
| Prep cadence / tactile cook loop | Locked pacing / outside presentation fence (domain + canvas). |
| Compose lifecycle / walk-to-station gate | Shipped design decision — only friction reduced, rules unchanged. |
| Ticket capacity 4 / 3–6 ingredients / 15 Ideal axes | Locked structural rules — untouched. |

### Verify

- `npx vitest run src/test/cooking-* src/test/ui` — pass
- `npm run typecheck` — clean for fenced files
- `npx eslint` on touched TS — clean
- Screenshots: `/tmp/aaa-shots/cooking-r3/` (`*-01-cta-in-flight`, `*-02-order-tab`, `*-03-compose-sheet` @ 390×844 + 1280×800)

