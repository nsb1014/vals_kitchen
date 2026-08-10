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
