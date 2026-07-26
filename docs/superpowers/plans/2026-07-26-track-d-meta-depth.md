# Track D — Meta Depth Implementation Plan

> Scope fence: no rush/patience; do not weaken scoring floors/tests.

**Goal:** Progression weight closer to GPGP — mastery feedback, pacing clarity, phrase/regular warmth.

## Deliverables (ship what fits overnight)

1. **Mastery feedback on serve** — review card shows mastery level-up / bonus when matched recipe leveled.
2. **Recipe book mastery UX** — clearer level + progress toward next (already has Lv.; add progress hint).
3. **Early-day pacing copy** — day-open / HUD hint for unlock goals without changing formulas.
4. **Regular-flavored phrases** — if archetype already supports, surface “regular” cue in bubble when same archetype returns (cheap); else skip.
5. **Do not** retune match floors downward; any tip/customer dial must keep tests green.

## Tasks

### Task 1: Serve review mastery line
- Wire `applyMasteryServe` leveledUp into pendingReview display / service-events
- Test: deliver matched recipe → review shows mastery bump

### Task 2: Recipe book progress
- Show `progress/needed` under mastery level in RecipeBookScreen / recipe-book presentation
- Unit test presentation helper

### Task 3: Soft pacing HUD (optional)
- FloorServiceHud day≥2: one-line prestige/rating context if cheap from selectors

### Task 4: Ship

## Out of scope tonight
- Full regulars persistence system
- Economy spreadsheet retune
- iPhone QA
