# AAA Critique — Onboarding, Chrome, Settings & Accessibility

**Slice:** first-run tutorial, app shell & navigation, screen transitions, notification system, settings, accessibility, responsive/PWA cues, error/empty states.

**Method:** Blind side-by-side against Nintendo first-party onboarding (Zelda: TotK teach-by-doing), Overcooked! 2 contextual floor cues, WCAG 2.2 AA, and Hearthstone-grade mobile settings polish. Evidence from source review, live Playwright session (`127.0.0.1:4185/?e2e=1`), screenshots at `/tmp/aaa-shots/chrome/`, targeted e2e passes, and manual a11y pass.

**Benchmark rationale:** TotK/Overcooked reward doing over reading; WCAG AA is the legal/ethical floor for keyboard, semantics, contrast, and targets; Hearthstone sets the bar for a complete, discoverable settings sheet (audio, account/save, credits, motion, install hints) without burying essentials.

---

## Scorecard (1 = poor · 5 = reference-grade)

| # | Category | Benchmark | Val's Kitchen | Verdict |
|---|----------|:---------:|:-------------:|---------|
| 1 | First-60-seconds clarity | 5 | 4 | **Near benchmark.** Cold boot lands on the live floor with cash/rating/day HUD, bottom nav, and an “Open for service?” sheet that names the full loop in one sentence (`ServiceDayUi.ts` L715–724). Screenshot `390x844-01-cold-boot.png`. Missing: no explicit “Day 1 tutorial” framing or skip affordance. |
| 2 | Tutorial teach-by-doing vs text walls | 5 | 4 | **Strong contextual cues.** Day-1 steps advance from floor state (`tutorial.ts`); banner copy is one line; `FloorServiceHud.ts` pairs notices with `.primary` action emphasis (screenshot `390x844-04-tutorial.png`). Stage-specific `wait_seat` copy verified by e2e (`floor-notifications.spec.ts`). Gap vs TotK: no in-world pointer/highlight on the table object—reliance on text + button glow only. |
| 3 | Navigation legibility | 4 | 3 | **Functional but fragmented.** Bottom nav exposes only **Floor** and **Recipe Book** (`navigation.ts` `NAV_SCREENS`). Shop is a layout-catalog sheet (`LayoutToolbar.ts`); Rating/Prestige/Day are HUD popovers (`ServiceDayUi.ts` L422–447); Settings is a gear icon. `ShopScreen.ts` / `RatingScreen.ts` exist but are **not mounted** in `main.ts`. PRD table lists six meta screens—player must discover routes. |
| 4 | Notification manners (stack, timing, interruption) | 5 | 4 | **Mature stack.** Single top banner host (`CelebrationBanner.ts`); tutorial 4s / toast 2.5s (`notification-timer.ts`); dismiss control 44×45px; blocking surfaces pause timers (`blocking-surface.ts`, `surface-lifecycle.ts`); compose/review/summary suppress banners (`selectNotificationUiBlocked`). Minor: Tab order prioritizes dismiss before gameplay actions during active tutorial. |
| 5 | Settings completeness | 5 | 3 | **Core present, polish missing.** Save Code export/import with `aria-live` feedback (`SettingsScreen.ts`, `save-code-ui.ts`); SFX + music toggles; CC0 credits load. vs Hearthstone: no volume sliders, no user-facing reduced-motion override, no import **confirm** dialog (immediate overwrite in `importSaveCode`), no tutorial replay, no graphics/language section. iOS A2HS prompt from PRD §11.3 **not implemented** (text-only warning). |
| 6 | Keyboard / focus coverage | 5 | 3 | **Modals excel; floor gaps.** Compose/review/summary/ceremony have focus traps and Escape handling (`ServiceDayUi.ts` L1524+); Settings focus-in/out tested (`mobile-state-transitions.spec.ts`). During floor service, Tab cycle: dismiss notice → tickets toggle → **body dead-end** → HUD stats (`eval-report.json` tabTrail)—**floor action buttons and canvas are not tabbable**. No keyboard path to seat/set table without pointer. |
| 7 | ARIA / screen-reader semantics | 5 | 4 | **Solid on DOM chrome.** `aria-label` on nav/HUD/floor tickets; `role="dialog"` + `aria-modal` on sheets; `role="status"` on save feedback; banner host `aria-live="polite"`. Gaps: notice `<aside>` lacks `role="status"`/label; canvas playfield has no accessible name or live region for tutorial step changes; HUD detail menu is `<aside>` without `role="dialog"` or labelled heading id. |
| 8 | Touch targets & zoom compliance | 5 | 4 | **Mostly AA.** Global `--vk-cta-h: 52px`, nav `min-height: 52px`, dismiss 44×45px (`global.css`, `screens.css`). Manual pass: settings gear **42×44** at 1280×800 (`eval-report.json`). `index.html` viewport allows pinch-zoom (no `user-scalable=no`). Floor actions scroll horizontally at 320px—usable but tight (`320x568-05-floor-chrome.png`). |
| 9 | Offline / PWA communication | 4 | 2 | **Backend-only.** `vite-pwa-lite.ts` injects manifest + SW on **production build**; dev `index.html` has no manifest link (eval warn). SW is network-first with silent reload on update (`pwa-cache-policy.ts`)—no user-facing “update available” or offline banner. No install CTA, no offline gameplay cue, no “you’re playing cached” copy. |
| 10 | Error recovery guidance | 4 | 3 | **Adequate for saves; thin elsewhere.** Boot failure renders `.boot-error` (`main.ts` L112–117). Save import/export returns typed messages (`save-code-ui.ts`). Empty states across shop/recipes/rating (`screen-empty` pattern). Missing: no retry on content-load failure, no guided recovery if `serviceStartPending` stalls, import lacks undo/warning. |
| 11 | Responsive behavior (320→desktop) | 5 | 4 | **Mobile-first holds.** Tested 320×568, 390×844, 1280×800—no horizontal overflow in manual pass; desktop splits canvas + 500px meta rail (`global.css` L500+). Safe-area padding on shell (`--vk-safe-bottom`). Nav hides during active service (intentional, `NavigationBar.ts` L74–76) but removes wayfinding mid-day. |

**Overall:** Val's Kitchen scores **~3.5/5** on this slice—strong floor-tutorial integration and notification architecture, weaker discoverability, PWA surfacing, and keyboard floor parity.

---

## Evidence log

### Play session (2026-08-10)

1. `npm run sync:data` → Vite dev `4185` → fresh `/?e2e=1` boot.
2. **Cold boot:** HUD + “Open for service?” sheet; nav shows Floor (active) + Recipe Book.
3. **Settings:** Gear → `settings-title` receives focus; export copies 967-char Save Code with success `role="status"` message.
4. **Tutorial:** After Open → Start Service → modifier dismiss, banner reads **“Set every table before guests can sit.”**; **Set table** button highlighted.
5. **Notifications:** Toast and celebration banners stack correctly; dismiss control visible.
6. **Keyboard:** 20× Tab on active floor—never reaches floor action buttons; outline visible on focused controls (gold 3px ring).
7. **Screenshots:** 36 PNGs under `/tmp/aaa-shots/chrome/`; machine report `/tmp/aaa-shots/chrome/eval-report.json`.

### Automated corroboration

- `floor-notifications.spec.ts` — distinct arriving/waiting/seating tutorial copy ✅
- `mobile-state-transitions.spec.ts` — Settings focus hand-off during active service ✅

---

## Ranked gaps (impact × frequency)

| Rank | Gap | Player impact |
|------|-----|---------------|
| 1 | Floor actions + canvas excluded from keyboard tab order | Keyboard-only and switch users cannot complete Day-1 tutorial |
| 2 | Bottom nav shows 2 of 6 PRD screens; Shop/Rating screens unmounted | New players don’t know where Shop/Rating/Flavors live |
| 3 | No PWA install / offline / update surfacing in UI | Mobile players miss A2HS; offline feels broken; silent SW reload surprises |
| 4 | Save restore overwrites without confirmation | Accidental paste destroys hours of progress |
| 5 | Tutorial lacks spatial affordance (world highlight) | Text-only cue vs TotK/Overcooked object-linked prompts |
| 6 | Settings missing volume, motion toggle, tutorial replay | Below Hearthstone completeness bar |
| 7 | Notice banner semantics incomplete for SR | Tutorial step changes may not announce when dismiss steals focus |
| 8 | Settings gear sub-44px width on wide desktop | Minor WCAG 2.5.8 target-size edge case |
| 9 | PRD iOS A2HS prompt after day 3 not built | iOS Safari save fragility under-communicated |
| 10 | `ShopScreen` / `RatingScreen` dead code vs mounted UX | Maintenance drift; docs/PRD mislead implementers |

---

## Concrete opportunities (implementable in fence)

### O1 — Keyboard-operable floor service strip (Complexity: **M**)

| | |
|---|---|
| **What** | Add floor chrome actions (`floor-set-table`, `floor-seat-next`, etc.) to a roving `tabindex` or natural tab order; optional `tabindex="0"` + `aria-label` on canvas with arrow-key move hints. |
| **Why / impact** | Unblocks WCAG 2.1.1 keyboard; Day-1 tutorial completable without pointer. |
| **Where** | `FloorServiceHud.ts` (button markup), `RestaurantApp.ts` (canvas tabindex), `service-day.css` (focus ring on `.service-btn`—partially present). |
| **Locked-rule risk** | **None** — UX/a11y only. |

### O2 — Expand bottom nav labels or add “More” hub (Complexity: **L**)

| | |
|---|---|
| **What** | Either mount `ShopScreen`/`RatingScreen` and register in `NAV_SCREENS`, or add a third “More” tab listing Shop, Rating, Settings with icons matching `NavigationBar.ts` `NAV_ICONS`. |
| **Why / impact** | Matches PRD screen table; reduces hidden-route churn; improves first-week retention. |
| **Where** | `navigation.ts`, `NavigationBar.ts`, `main.ts` (mount screens), `screenRouter.ts`. |
| **Locked-rule risk** | **Low** — layout/bundle surface only; watch initial JS ≤280k gzip. |

### O3 — PWA status chip + iOS A2HS nudge (Complexity: **M**)

| | |
|---|---|
| **What** | Dev/prod manifest link in `index.html` or dev middleware; lightweight banner: “Install app” / “Playing offline” / “Update ready—reload”; day-3 dismissible A2HS per PRD §11.3. |
| **Why / impact** | Closes trust gap on saves; reduces iOS data loss. |
| **Where** | `index.html`, `public/manifest.webmanifest` (new for dev), `scripts/vite-pwa-lite.ts`, new `src/ui/notifications/pwa-status.ts` or extend `CelebrationBanner.ts` host. |
| **Locked-rule risk** | **None** — no `user-scalable=no`. |

### O4 — Import Save Code confirmation gate (Complexity: **S**)

| | |
|---|---|
| **What** | Modal or inline confirm: “Replace current Day X save?” with Cancel / Restore; focus trap; `aria-describedby` on warning. |
| **Why / impact** | Prevents catastrophic mis-tap; matches Hearthstone account-restore patterns. |
| **Where** | `SettingsScreen.ts`, `save-code-ui.ts` (copy strings). |
| **Locked-rule risk** | **None**. |

### O5 — Spatial tutorial highlights on canvas (Complexity: **L**)

| | |
|---|---|
| **What** | When `tutorial.ts` step is `set_tables`, pulse nearest unset table; `wait_seat` highlights door line; tie to existing `getInteractHintCells` / e2e bridge patterns. |
| **Why / impact** | TotK/Overcooked parity—teach **where** not just **what**. |
| **Where** | `tutorial.ts` (step metadata), `RestaurantApp.ts` / actor layer, `FloorServiceHud.ts` (sync step), optional `src/domain/floor/tutorial.ts` highlight map. |
| **Locked-rule risk** | **None** — presentation only; tutorial strings unchanged. |

### O6 — Notice banner semantics + focus order (Complexity: **S**)

| | |
|---|---|
| **What** | `role="status"` + `aria-label="Tutorial"` on notice aside; defer dismiss button tab order (`tabindex="-1"`) until explicit Esc; announce step changes via `aria-live` on host when `stepId` changes. |
| **Why / impact** | Screen readers hear tutorial progression; keyboard users reach gameplay buttons first. |
| **Where** | `CelebrationBanner.ts`, `notification-timer.ts`, `global.css`. |
| **Locked-rule risk** | **None**. |

### O7 — Settings completeness pack (Complexity: **M**)

| | |
|---|---|
| **What** | Master volume + SFX/Music sliders (store already has booleans); “Reduce motion” user override (respect + override `prefers-reduced-motion`); “Replay tutorial tips” (clear `tutorialDismissedStepId` on day 1 replay). |
| **Why / impact** | Hearthstone-grade settings; accessibility for vestibular sensitivity. |
| **Where** | `SettingsScreen.ts`, `game-store.ts` (persist flags), `global.css` / `RestaurantApp.ts` (motion gate). |
| **Locked-rule risk** | **Low** — new persisted fields need autosave migration (existing pattern). |

### O8 — Touch target fix for settings gear at desktop widths (Complexity: **S**)

| | |
|---|---|
| **What** | `min-width: 44px` on `.hud-settings-button` in flex HUD layout at ≥1280. |
| **Why / impact** | WCAG 2.5.8 compliance on desktop trackpad users. |
| **Where** | `service-day.css` (~L29, L1716). |
| **Locked-rule risk** | **None**. |

---

## What already meets the bar (keep)

- **Unified notification stack** with lifecycle pause, blocking-surface detection, and timer controller separation (`notification-timer.ts`, `CelebrationBanner.ts`).
- **Settings focus return** after close (`SettingsScreen.ts` L127–186) — e2e-proven during service.
- **Open-day sheet** as low-friction onboarding gate with secondary Shop & Edit path.
- **Contextual tutorial copy** tied to guest `entering` / `waiting` / `seating` stages.
- **Global focus-visible** ring and reduced-motion CSS on banners (`global.css` L305–310, L425–432).
- **Save Code UX** with iOS storage warning and live feedback region.

---

## Suggested verification tests (fence: `src/test/chrome-*.test.ts`)

- `chrome-floor-keyboard.test.ts` — Tab reaches each enabled floor action in tutorial order.
- `chrome-notice-semantics.test.ts` — notice has `role="status"`; step change fires live region text.
- `chrome-settings-import-confirm.test.ts` — restore requires confirm click.
- `chrome-pwa-manifest.test.ts` — built `index.html` contains manifest link (build artifact test).

---

## Artifact index

| Artifact | Path |
|----------|------|
| Screenshots (320 / 390 / 1280) | `/tmp/aaa-shots/chrome/*.png` |
| Machine eval JSON | `/tmp/aaa-shots/chrome/eval-report.json` |
| Playwright harness | `/workspace/chrome-a11y-eval.mjs` (eval-only, not committed) |

*Report generated read-only; no source changes in this pass.*

---

## Implemented (round 1)

Completed top-5 chrome opportunities inside the agent fence:

| Opp | What shipped |
|-----|----------------|
| **O1** | Floor action strip is a single `role="toolbar"` tab stop with `aria-activedescendant` + arrow/Home/End/Enter (`floor-action-keyboard.ts` wired from `FloorServiceHud.ts`). Disabled actions stay discoverable without being native tab stops. |
| **O2 / O10** | `ShopScreen` + `RatingScreen` mounted in `main.ts`. Bottom nav gains a **More** hub (Shop / Rating / Settings) — `NAV_SCREENS` left untouched (store selector outside fence). |
| **O3 / O9** | Dev `index.html` + `public/manifest.webmanifest`; `mountPwaStatusNotices` surfaces install / offline / update / iOS A2HS (day ≥ 3) via the existing toast stack. |
| **O4** | Settings Restore opens a confirm dialog (`buildImportConfirmCopy` / `beginSaveImport`) before `importSaveCode`. |
| **O5** | `tutorialHighlightTarget` metadata + DOM pulse overlay (`TutorialHighlightOverlay`) positioned over table/door/kitchen cells — no canvas layer edits. |

**Skipped (with reason):**

| Opp | Why |
|-----|-----|
| **O6** | Notice banner semantics live in `CelebrationBanner.ts` (outside fence). |
| **O7** | Volume/motion/tutorial-replay need `game-store.ts` persistence (locked). |
| **O8** | Settings gear target fix is in `service-day.css` (locked). |

**Tests:** `src/test/chrome-*.test.ts` (+ existing notifications/pwa suites still green).
