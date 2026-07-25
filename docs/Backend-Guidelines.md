# Backend Guidelines

**Status:** Design complete  
**Important:** This game has **NO server**. There is no backend API, database server, authentication service, or cloud sync. All "backend-equivalent" logic runs **client-side** in the browser.

**Gameplay formulas (numeric constants):** Owned by [PRD.md](./PRD.md). This document defines **implementations**, types, invariants, and pipelines — not duplicate formula tables.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Domain Core (Pure & Deterministic)](#2-domain-core-pure--deterministic)
3. [Flavor Schema & Scoring Engine](#3-flavor-schema--scoring-engine)
4. [Economy Engine](#4-economy-engine)
5. [Rating, Prestige & Day Simulation](#5-rating-prestige--day-simulation)
6. [Persistence Layer](#6-persistence-layer)
7. [RNG Determinism & Seeding](#7-rng-determinism--seeding)
8. [Content Data Pipeline](#8-content-data-pipeline)
9. [Network Independence Rule](#9-network-independence-rule)
10. [Cross-References](#10-cross-references)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  UI (DOM) + Canvas (PixiJS)                             │
├─────────────────────────────────────────────────────────┤
│  Zustand Store (orchestration, actions)                 │
├─────────────────────────────────────────────────────────┤
│  DOMAIN CORE (pure TypeScript, zero framework imports)  │
│  ├── flavor/     scoring, aggregation, phrases         │
│  ├── economy/    costs, tips, purchases                  │
│  ├── rating/     star movement, prestige triggers      │
│  ├── day/        customer gen, modifiers, score kernels│
│  ├── floor/      seats, tickets, table lifecycle, nav  │
│  └── rng/        seeded PRNG                             │
├─────────────────────────────────────────────────────────┤
│  PERSISTENCE (repository over IndexedDB)                │
│  ├── serialize / deserialize                           │
│  ├── migrations                                        │
│  └── saveCode (LZ-String + base64url)                  │
├─────────────────────────────────────────────────────────┤
│  DATA (static JSON bundled at build time)               │
│  ingredients, recipes, archetypes, modifiers, upgrades │
└─────────────────────────────────────────────────────────┘
```

**Dependency rule:** `domain/` and `data/` must not import PixiJS, DOM APIs, Zustand, or idb-keyval. Persistence adapters import domain types only.

---

## 2. Domain Core (Pure & Deterministic)

### Why Pure

- Unit testable without browser (Vitest).
- Save/replay debugging: same seed + actions → same outcomes.
- Migration safety: recompute derived values from canonical state.

### Module Contracts

Each module exports pure functions:

```typescript
// domain/flavor/scoring.ts
export function computeMatchStars(
  dish: FlavorVector,
  preference: CustomerPreference,
  ingredientIds: string[],
  compoundAffinityMatrix: AffinityMatrix,
): number;

// domain/economy/tips.ts
export function computeTip(input: TipInput): number;

// domain/rating/update.ts
export function applyReview(currentRating: number, matchStars: number): RatingResult;

// domain/day/generate.ts
export function generateDay(input: DayGenInput, rng: Rng): GeneratedDay;
```

### GameState Type

```typescript
interface GameState {
  saveVersion: 1;
  day: number;
  cash: number;
  prestige: number;
  rating: number;

  unlockedIngredientIds: string[];   // ordered unlock sequence
  purchasedEquipmentIds: string[];  // kitchen gates owned this run
  discoveredRecipeIds: string[];

  gridSize: { w: number; h: number };
  placements: Placement[];
  seatingCapacity: number;

  // in-progress day — serialized on mid-day quit (Ruling 8)
  activeDay: SerializedActiveDay | null;
  composeDraftIngredientIds?: string[];  // partial dish selection, saved with activeDay

  stats: {
    totalCustomersServed: number;
    totalEarnings: number;
    prestigesTotal: number;
  };
}
```

### Reducer Pattern

```typescript
type GameAction =
  | { type: 'OPEN_DAY' }
  | { type: 'SERVE_DISH'; ingredientIds: string[] }
  | { type: 'NEXT_CUSTOMER' }
  | { type: 'CLOSE_DAY' }
  | { type: 'PURCHASE_INGREDIENT' }
  | { type: 'PURCHASE_TABLE' }
  | { type: 'PURCHASE_EQUIPMENT'; equipmentId: string }
  | { type: 'PURCHASE_GRID_EXPANSION' }
  | { type: 'PLACE_ITEM'; placement: Placement }
  | { type: 'REMOVE_ITEM'; placementId: string }
  | { type: 'PRESTIGE_TRIGGERED' }
  | { type: 'SOFT_RESET' };

function gameReducer(state: GameState, action: GameAction, context: DomainContext): GameState;
```

Store actions call `gameReducer`; reducer calls domain functions; returns new immutable state.

---

## 3. Flavor Schema & Scoring Engine

### FlavorVector Type

```typescript
type AxisKey = 'SW'|'SA'|'SO'|'BI'|'UM'|'HE'|'FR'|'EA'|'SM'|'PU'|'NU'|'RI'|'LI'|'HT'|'CR';
type TempKey = 'TE';

interface FlavorVector {
  SW: number; SA: number; SO: number; BI: number; UM: number;
  HE: number; FR: number; EA: number; SM: number; PU: number; NU: number;
  RI: number; LI: number; HT: number; CR: number;
  TE: -1 | 0 | 1;
}

interface Ingredient {
  id: string;
  name: string;
  category: string;
  equipmentId: string;     // exactly one of 12 equipment groups
  flavor: FlavorVector;
  compoundIds: string[];   // for Ahn affinity QA
  purchaseIndex: number;   // 0-based unlock order within run for cost formula
  starter?: boolean;       // free on new game (9) or soft reset (5 subset)
}
```

All continuous axes clamped to `[0, 10]` at data load.

### Dish Aggregation (3–6 Ingredients)

For continuous axis `a`:

```
dish[a] = (1 - α) × mean(ingredient[a]) + α × max(ingredient[a])
```

| Axis group | Keys | α |
|------------|------|---|
| Tastes + mouthfeel (non-aroma) | SW, SA, SO, BI, UM, RI, LI, CR | 0.25 |
| Aroma | HE, FR, EA, SM, PU, NU | 0.40 |
| Heat | HT | 0.55 |

**Temperature TE:** mode of ingredient TE values; tie-break toward `+1`.

```typescript
function aggregateDish(ingredients: FlavorVector[]): FlavorVector;
```

### Customer Preference Type

```typescript
type Band = 'low' | 'mid' | 'high';

interface CustomerPreference {
  primary: Partial<Record<AxisKey, Band>>;
  avoid: Partial<Record<AxisKey, boolean>>;  // desire dish[a] <= 4
  phrases: string[];  // precomposed bubble lines
}

interface Customer {
  id: string;
  archetypeId: string;
  preference: CustomerPreference;
  hiddenSecondary?: Partial<Record<AxisKey, Band>>;  // optional advanced archetypes
}
```

### Axis Satisfaction

For each axis `a` with preference band:

```
if avoid[a] and dish[a] > 4:
  sat[a] = 0
elif band == 'high':
  sat[a] = clamp(dish[a] / 10, 0, 1)
elif band == 'mid':
  sat[a] = 1 - abs(dish[a] - 5) / 3
elif band == 'low':
  sat[a] = 1 - clamp(dish[a] / 4, 0, 1)
else:
  sat[a] = 0.7  // only used when axis is explicitly evaluated; unmentioned axes are excluded from weighted_sat
```

### Weighted Satisfaction

Only **primary** and **avoid** axes participate in the score. Unmentioned axes are neutral — they do not inflate satisfaction (retuned 2026-07-25; previously unmentioned axes contributed 0.7 each and compressed review spread).

```
weighted_sat = (2 × Σ sat[primary] - 5 × avoid_violations)
               / (2 × |primary|)
```

If a preference has avoid axes but no primary axes, violations reduce a 0.5 baseline.

`avoid_violations` = count of avoid axes where `dish[a] > 4`.

### Compound Affinity Bonus

From Ahn-style shared compound sets (authored per ingredient):

```
compound_affinity(i, j) = |Ci ∩ Cj| / max(1, min(|Ci|, |Cj|))
affinity_bonus = mean(compound_affinity(i,j)) for all pairs in dish
```

Normalize pair scores to `[0, 1]` globally at build time.

### Final Match Score

```
match_stars = clamp(10 × (0.85 × weighted_sat + 0.15 × affinity_bonus) + recipe_bonus, 0, 10)
recipe_bonus = 0.75 if matchedRecipe else 0
```

Round display to 1 decimal. Recipe match: ingredient multiset equals authored recipe (order-independent).

```typescript
function findMatchingRecipe(
  ingredientIds: string[],
  recipes: Recipe[],
): Recipe | null;
```

---

## 4. Economy Engine

Numeric constants from [PRD.md §6–§7](./PRD.md). Implementation:

```typescript
function upgradeCost(base: number, rate: number, n: number): number {
  return Math.floor(base * Math.pow(rate, n));
}

function basePayout(day: number): number {
  return Math.floor(20 + 8 * Math.pow(day, 0.55));
}

function ratingMultiplier(stars: number): number {
  return Math.pow(Math.max(0, stars / 3), 1.3);
}

function prestigeMultiplier(prestige: number): number {
  return Math.pow(1.18, prestige);
}

function computeTip(input: {
  day: number;
  rating: number;
  prestige: number;
  matchStars: number;
}): number {
  const mq = input.matchStars / 10;
  const matchFactor = 0.3 + 0.7 * Math.pow(mq, 1.5);
  return Math.floor(
    basePayout(input.day)
    * ratingMultiplier(input.rating)
    * prestigeMultiplier(input.prestige)
    * matchFactor
  );
}
```

### Purchase Validation

```typescript
function canPurchase(state: GameState, item: PurchaseKind): boolean;
function applyPurchase(state: GameState, item: PurchaseKind): GameState;
```

Atomic: deduct cash, append unlock, or fail without mutation.

---

## 5. Rating, Prestige & Day Simulation

### Rating Update

```typescript
function applyReview(rating: number, matchStars: number): {
  rating: number;
  prestigeTriggered: boolean;
  softResetTriggered: boolean;
} {
  const delta = (matchStars - 5) * 0.08;
  let next = Math.min(6, Math.max(0, rating + delta));
  return {
    rating: next >= 6 ? 3 : next,  // prestige handled separately
    prestigeTriggered: next >= 6,
    softResetTriggered: next <= 0,
  };
}
```

On prestige: `prestige += 1`, `rating = 3`, run continues.  
On soft reset: apply [PRD.md §8](./PRD.md) restart snapshot; `prestige` unchanged.

### Prestige Pacing (Balance)

Constants live in `src/domain/balance/prestige-pacing.ts`:

```typescript
// Rating delta multiplier at prestige P (applied in serveCustomer):
prestigeRatingDeltaMultiplier(P) = max(0.06, 1 / (1 + P × 0.6))

// Purchase cost multiplier at prestige P (capped):
prestigeEconomyCostMultiplier(P) = min(10, 1.085^P)   // P=0 → 1.0

// Calibrated analytic cycle-length proxy (competent play, seed 424242; PRD §10.1.1):
projectedCycleDays(P) = round(min(68, 6 + 2.0×P + 0.03×P²))
```

`applyReview` receives `deltaMultiplier × prestigeRatingDeltaMultiplier(P) × modifierMultiplier`. Payout prestige multiplier (`1.18^P`) is unchanged. Purchase costs use `scaledUpgradeCost(base, rate, n, prestige)`.

**Competent dish selection** (`findBestMatchCombo`): preference-ranked shortlist (20 ingredients), optimal search on the top 12 unlocked ingredients, multi-seed greedy builds, then capped combo enumeration (`COMPETENT_MATCH_EVAL_CAP = 512`). Exhaustive `findOptimalMatchCombo` is for unit tests / unlock sets ≤12 only.

### Day Generation

```typescript
function customersPerDay(input: {
  seatingCapacity: number;
  rating: number;
  prestige: number;
  day: number;
}): number {
  const raw = Math.floor(3 + input.rating * 0.8 + input.prestige * 0.5 + Math.pow(input.day, 0.2));
  return Math.min(input.seatingCapacity, raw);
}

function generateDay(input: DayGenInput, rng: Rng): GeneratedDay {
  const count = customersPerDay(input);
  const modifier = pickModifier(input.day, rng);
  const flavorEnvelope = computeUnlockedFlavorEnvelope(input.unlockedIngredientIds, ctx.ingredients);
  const customers = Array.from({ length: count }, (_, i) =>
    generateCustomer(flavorEnvelope, input.archetypes, rng.fork(i))
  );
  return { seed: input.seed, modifier, customers, queueIndex: 0, earnings: 0 };
}
```

**Customer generation (Ruling 12):** `generateCustomerRequest` computes the unlocked **flavor envelope** (dish min/max per axis) and **ingredient profile** (per-axis variance/peak across unlocked items). Likes/dislikes may only use **actionable axes** — strong in the current pantry and spread-bearing in dishes. Witness combos are shuffled; satisfiable preferences with ≥2 scored cues are collected and one is chosen at random. Bubble phrases mirror scored primary/avoid axes (same vocabulary as the flavor inspector). Never emit flavor-noise cues on axes every starter dish already satisfies; never emit bands the unlock set cannot reach.

### Serve Flow

```typescript
function serveCustomer(
  state: GameState,
  ingredientIds: string[],
  ctx: DomainContext,
): ServeResult {
  // validate 3–6 ids, all unlocked
  const dish = aggregateDish(...);
  const matchStars = computeMatchStars(...);
  const tip = computeTip({...});
  const ratingResult = applyReview(state.rating, matchStars);
  const recipe = findMatchingRecipe(ingredientIds, ctx.recipes);
  // emit review, update earnings, maybe discover recipe
}
```

---

## 6. Persistence Layer

### Repository Pattern

```typescript
interface SaveRepository {
  load(): Promise<GameState | null>;
  save(state: GameState): Promise<void>;
  exportSaveCode(state: GameState): string;
  importSaveCode(code: string): GameState;
}
```

Implementation: `idb-keyval` with keys:

| Key | Purpose |
|-----|---------|
| `restaurant-save` | Current save |
| `restaurant-save-backup` | Previous write |

### Serialization

- JSON.stringify canonical `GameState` (sorted keys for stable checksum).
- No derived caches in save blob.

### Checksum

```typescript
function computeChecksum(json: string): string {
  // CRC32 or FNV-1a hex — detect transcription errors on import
}
```

### Save Code Format

```
RS1.<base64url(LZString.compressToUTF8(JSON.stringify(envelope)))>
```

```typescript
function exportSaveCode(state: GameState): string {
  const envelope: SaveEnvelope = {
    saveVersion: 1,
    checksum: computeChecksum(canonicalJson(state)),
    createdAt: new Date().toISOString(),
    gameState: state,
  };
  const compressed = LZString.compressToUTF8(JSON.stringify(envelope));
  return `RS1.${base64UrlEncode(compressed)}`;
}
```

Import reverses; validates prefix `RS1`, decompresses, verifies checksum, runs migrations.

### Version Migrations

```typescript
const MIGRATIONS: Record<number, (raw: unknown) => unknown> = {
  // 1: initial
};

function migrateSave(raw: unknown): SaveEnvelope {
  let version = detectVersion(raw);
  while (version < CURRENT_SAVE_VERSION) {
    raw = MIGRATIONS[version + 1](raw);
    version++;
  }
  return raw as SaveEnvelope;
}
```

**Rules:**

- Never delete fields without migration path.
- Add optional fields with defaults in migration.
- Test golden saves from each version.

### Corruption Handling

| Failure | Recovery |
|---------|----------|
| IndexedDB read throws | Offer backup key or new game |
| Checksum mismatch on import | Reject with clear error |
| Schema validation fail | Reject import; keep current save |
| Mid-write crash | Restore from backup key |

### Boot Persistence

```typescript
async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage?.persist) {
    return navigator.storage.persist();
  }
  return false;
}
```

Call once on first load; surface result in settings diagnostics.

---

## 7. RNG Determinism & Seeding

### PRNG

Use mulberry32 or similar fast seeded PRNG — **not** `Math.random()` in domain code.

```typescript
interface Rng {
  next(): number;       // [0, 1)
  nextInt(min: number, max: number): number;
  fork(salt: number): Rng;
}

function createRng(seed: number): Rng;
```

### Day Seed

```
daySeed = hash(globalRunSeed, dayNumber, prestige)
```

Store `globalRunSeed` in `GameState` (generated on new game). Store `activeDay.seed` when day opens.

### Determinism Scope

| Deterministic (seeded) | Non-deterministic (acceptable) |
|------------------------|--------------------------------|
| Customer archetype rolls | UI animation timing |
| Preference jitter | Pointer drag pixel positions |
| Daily modifier selection | |
| Customer count (given state) | |

### Debug/Replay

Log `{ day, seed, queueIndex, action, ingredientIds }` in dev builds for regression reproduction.

---

## 8. Content Data Pipeline

### Deviation from RESEARCH.md

[RESEARCH.md §4](./RESEARCH.md) recommended TheMealDB + Wikibooks hybrid. **User ruling #5 overrides:** all ~1000 recipes are **authored in-house**. USDA FoodData Central (CC0) informs ingredient **names/categories only** — not recipe text.

### Pipeline Overview

```
1. Author ~100 ingredients (USDA-informed names + manual flavor vectors)
2. Build compound affinity matrix (Ahn 2011 subset mapping)
3. Define cuisine templates (Italian, Mexican, East Asian, …)
4. Generate ~1000 recipes via constrained combinator + template fill
5. Validate invariants (CI gate)
6. Export JSON to src/data/
```

### Ingredient Master List

| Field | Requirement |
|-------|-------------|
| Count | Exactly 100 |
| equipmentId | Each ingredient references exactly one of 12 equipment IDs |
| Partition | Every equipment group has ≥1 ingredient; no orphan ingredients |
| Starters | 5 PRD starters + 4 additional new-game starters (9 total); 5-only on soft reset |
| flavor | 16-axis authored manually |
| compoundIds | For affinity QA |
| purchaseIndex | 0–99 for per-run ingredient cost `floor(150 × 1.14^n)` |

Equipment definitions in `data/equipment.json`:

| Field | Requirement |
|-------|-------------|
| id | One of 12 gate IDs (see [PRD.md §6.3](./PRD.md)) |
| purchaseIndex | `null` for `prep_station` (start owned); 0–10 for purchasable gates |
| ingredientGroupName | Display label |
| **No passiveBonus fields** | Equipment gates shop eligibility only |

**USDA usage:** Query FoodData Central (CC0) for canonical naming and food-group diversity. Attribution in credits: "Ingredient names informed by USDA FoodData Central (CC0)."

### Recipe Generation Algorithm

```typescript
interface Recipe {
  id: string;
  name: string;              // original prose — no third-party text
  cuisineTag: string;
  ingredientIds: string[];   // length 3–6
  description: string;       // original one-liner
}

function generateRecipes(
  ingredients: Ingredient[],
  templates: CuisineTemplate[],
  targetCount: 1000,
  rng: Rng,
): Recipe[];
```

**Generation steps:**

1. For each cuisine template, define typical axis targets (e.g., Italian → UM mid-high, RI mid).
2. Sample 3–6 ingredients where:
   - All IDs exist in master list.
   - Combined flavor vector satisfies template bands.
   - Mean pairwise `compound_affinity` ≥ 0.15 (culinary plausibility).
   - No duplicate ingredient in recipe.
3. Assign original name via template pattern `{adj} {protein} {form}` from internal word bank (not external corpus).
4. Deduplicate by sorted ingredient ID multiset.
5. Fill to 1000 with varied templates; ensure coverage per equipment group.

### Validation Invariants (CI Must Pass)

```typescript
interface ValidationReport {
  errors: string[];
  warnings: string[];
}

function validateContent(data: ContentBundle): ValidationReport;
```

**Hard errors (block build):**

| ID | Invariant |
|----|-----------|
| V1 | Exactly 100 ingredients; 5 soft-reset starters + 9 new-game starters present |
| V2 | Every recipe has 3–6 unique ingredient IDs from master list |
| V3 | No duplicate recipe multisets |
| V4 | All axis values in `[0,10]`; TE in `{-1,0,1}` |
| V5 | **Satisfiability:** For each representative unlock state S, for each preference `generateCustomerRequest` emits, witness combo score ≥ tier floor: ≤5 ingredients → 6.5; 6–12 → 6.8; ≥13 → 7.0 |
| V6 | Every ingredient appears in ≥ 5 recipes (no orphan unlocks) |
| V7 | No third-party prose strings in recipe names/descriptions (lint against blocklist) |
| V8 | Compound affinity matrix symmetric, values `[0,1]` |
| V9 | **Equipment partition:** Every ingredient has exactly one `equipmentId`; 12 groups sum to 100; no duplicate assignments |

**Warnings (review):**

- Ingredient unused in any recipe.
- Template skew > 40% one cuisine.
- Archetype phrase missing for axis/band combo.

### Customer Archetypes (20)

Stored in `data/archetypes.json`:

```typescript
interface Archetype {
  id: string;
  name: string;
  primaryAxisWeights: Partial<Record<AxisKey, number>>;
  avoidProbability: number;
  phraseTemplateIds: string[];
}
```

Phrase templates in `data/phrases.json` — overlapping schemas per [PRD.md §5.3](./PRD.md).

### Daily Modifiers

`data/modifiers.json` — 5–10 entries with `{ id, name, description, effect: ModifierEffect }`. Effects implemented as pure functions on tip/match/rating.

---

## 9. Network Independence Rule

**No game logic may depend on network access.**

| Allowed | Forbidden |
|---------|-----------|
| Static asset loads from same origin (bundled) | Runtime API calls for recipes/ingredients |
| Optional analytics (if added later, non-blocking) | CDN fetch for game data JSON |
| Deploy hosting serves static files | TheMealDB or any external recipe API |
| User manual Save Code copy/paste | Cloud save sync |

Game must be fully playable offline after first load (PWA service worker caches shell + assets).

---

## 10. Cross-References

| Topic | Document |
|-------|----------|
| Product rules & formula ownership | [PRD.md](./PRD.md) |
| PixiJS/DOM split, store patterns | [Frontend-Guidelines.md](./Frontend-Guidelines.md) |
| iPhone 17, IndexedDB, hosting | [Tech-Stack.md](./Tech-Stack.md) |
| Build phases & validators | [Plan.md](./Plan.md) |
| Known risks | [Error-Tracker.md](./Error-Tracker.md) |
