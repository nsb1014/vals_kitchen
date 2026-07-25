# Restaurant Simulator — Design Research

**Purpose:** Input document for technical design and full implementation.  
**Target platform:** Mobile-first web game, optimized for iPhone 17 Safari.  
**Confirmed design rulings:** Discrete tap-paced service days; top-down Stardew/Chef RPG pixel art; 0-star soft reset (keep prestige); one-pass full build.

---

## Table of Contents

1. [How Restaurant Simulators Work](#1-how-restaurant-simulators-work)
2. [Game Economy Design](#2-game-economy-design)
3. [Flavor / Taste Profile Systems](#3-flavor--taste-profile-systems)
4. [Recipe Data Sources](#4-recipe-data-sources)
5. [CC0 Art & Audio Assets](#5-cc0-art--audio-assets)
6. [Free Web Hosting for a Static Browser Game](#6-free-web-hosting-for-a-static-browser-game)
7. [Browser Save Persistence Without Login](#7-browser-save-persistence-without-login)
8. [Mobile-First Tech Stack](#8-mobile-first-tech-stack)
9. [Recommendations Summary](#9-recommendations-summary)

---

## 1. How Restaurant Simulators Work

This section analyzes reference titles through the lens of **our confirmed tap-paced, no-timer design**. Real-time pressure mechanics are noted only as **anti-patterns to avoid**.

### Summary Comparison Table

| Game | Core Loop | Typical Session | Progression Gates | Stickiness | Economy Inflation | Grind-Fatigue Avoidance |
|------|-----------|-----------------|-------------------|------------|-------------------|--------------------------|
| **Chef RPG** (primary) | Day/night town loop → open restaurant → fulfill orders via cooking minigames → close → sleep | 30–90 min/day | Story quests, Prestige levels, recipe rarity, equipment, staff | Recipe discovery, Autocook unlock, town contributions, multiple restaurant modes | Ingredient costs scale with rarity; Prestige rewards recipes + skill points | Autocook after tutorial; staff delegation; multiple operation modes (Teahouse, Pub, etc.) |
| **Cook, Serve, Delicious!** | Menu planning → timed service rush → spend earnings on upgrades | 5–15 min/shift | Star rank via YUM (CSD2+) or checklists (CSD1) | Buzz system, boosters/detractors, combo scoring | Complex menu items = higher profit + higher difficulty | Optional objectives; buzz self-regulates difficulty |
| **Good Pizza, Great Pizza** | Take order → assemble pizza → bake → tip | 3–10 min/order | Chapter gates, ingredient/equipment unlocks | Story chapters, cryptic orders, rival shop | Toppings cost money; over-topping hurts profit | Chapters introduce mechanics gradually; Pie Chart rent tied to rating |
| **Papa's ___eria** | Station pipeline → assemble to ticket spec → score | 5–20 min/day | New customers, ingredients, stations per rank | Star Customer loyalty, Food Critic, blue ribbon weeks | Upgrade shop expands capabilities | Multi-station accuracy % maps to tips; 80%+ earns star progress |
| **Diner Dash** | Seat → order → serve → bus → repeat under time pressure | 5–10 min/level | Level map, decor upgrades | Combo chains, VIP customers | Decor increases patience (more time) | Short levels; new venues |
| **Cooking Fever** | Real-time cook/serve → upgrade kitchen between levels | 2–5 min/level | XP level + coins/gems to unlock restaurants | 40 levels × many restaurants; daily gems | Upgrade costs climb faster than income mid-game | Depth-first 3-star before next restaurant |
| **Idle Restaurant Tycoon** | Passive income → upgrade tables/staff → unlock new restaurant | Continuous / check-in | Stars per restaurant unlock next venue | Collectible cards (permanent bonuses) | Power budget limits generators | Multiple restaurant themes |
| **Recettear** | 4 time-slots/day: shop OR dungeon OR town | 15–45 min/day | Weekly debt payments (820,000 pix total) | Haggling, dungeon loot, story | Debt steps: 10k→30k→80k→200k→500k | Failure = soft restart keeping merchant level |
| **Stardew Valley** | 20-hour day, energy-limited tasks, sleep to advance | 15–60 min/day | Seasons, friendship hearts, bundles | Discovery, community, crop cycles | Tool upgrades, seed costs | Energy gate + season variety |
| **Cooking Simulator** | Physics cooking sandbox / career scenarios | 10–30 min/scenario | Career stars, recipe unlocks | Realistic interaction novelty | Ingredient waste costs | Scenario variety |
| **Overcooked** | Co-op real-time order fulfillment | 3–8 min/level | Level map, score thresholds | Kitchen layout puzzles, co-op chaos | N/A (score-based) | Layout changes force role shifts |
| **Restaurant Empire** | Build/decorate → menu design → real-time service → campaign goals | 30–60 min/scenario | 18-scenario campaign, reputation | Story, cooking competitions, cuisine choice | Ingredient quality tiers affect cost/reputation | Sandbox mode after campaign |

---

### Chef RPG (Primary Reference)

**Sources:** [Chef RPG Cooking Wiki](https://chefrpg.wiki.gg/wiki/Cooking), [Restaurant Wiki](https://chefrpg.wiki.gg/wiki/Restaurant), [TechRaptor beginner guide](https://techraptor.net/gaming/guides/chef-rpg-guide-beginner-tips-and-tricks), [Version 0.6 Prestige update](https://chefrpg.wiki.gg/wiki/Version_Updates)

**Core loop:**
1. Wake / start day in town (NPC gifts, shopping, foraging).
2. Stock refrigerator with ingredients (per-restaurant inventory).
3. Configure menu from discovered recipes (242 total; 4 categories × 4 rarity tiers).
4. Open restaurant → customers arrive → waiters take orders → player or staff cook via **appliance-specific minigames**.
5. Dish quality score from minigame performance + skills + combo meter.
6. Close restaurant (~9:30 PM recommended) → sleep → next day.

**Session length:** One in-game day ≈ 30–90 real minutes depending on how long the restaurant stays open.

**Progression gates:**
- **Recipes:** NPC gifts, shops, research, Prestige rewards.
- **Prestige:** Restaurant performance goals → Prestige level → recipes, skill points, power cells.
- **Equipment:** Cooking stations (Stove, Oven, Barista, Mixing Station, etc.) gate recipe types.
- **Staff:** Chefs automate cooking; skills improve speed/quality.
- **Operation modes:** Restaurant / Social House / Teahouse / Pub / Confectionery — each changes order mix and bonuses (+5% to +20% category bonuses).

**What makes it sticky:**
- Recipe discovery (242 recipes, rarity tiers).
- Autocook unlock per appliance (skips minigame after mastery).
- Combo Cooking meter (quality + speed bonuses up to ×10).
- Town Contributions (donate resources → unlock shops, areas).
- Multiple restaurant locations (Le Sequoia, Peony Teahouse).

**Economy inflation:** Ingredient sourcing costs time (foraging) or money (vendors). Higher-rarity recipes need rarer ingredients. Prestige v0.6 rebalanced power cells and crafting costs.

**Grind-fatigue avoidance:** Autocook, staff delegation, operation mode variety, story quests breaking pure service monotony.

**Applicability to our game:** Chef RPG validates **day open → serve queue → day summary → sleep/advance** structure. Our game removes real-time minigame pressure and replaces it with **taste-matching composition** — but keeps day summaries, menu/ingredient gates, Prestige, and layout building.

---

### Cook, Serve, Delicious!

**Sources:** [Game Wisdom spotlight](https://game-wisdom.com/spotlight/cook-serve-delicious), [CSD2 YUM progression preview](https://chubigans.tumblr.com/post/148306197629/csd-2-preview-game-progression), [Boosters/Detractors update](https://www.vertigogaming.net/blog/?p=1646), [GameMaker interview](https://gamemaker.io/en/blog/cook-serve-delicious-interview)

**Core loop:** Pre-shift menu planning (6 active items from 20+) → timed order fulfillment → spend earnings on food/equipment/upgrades.

**Session length:** 5–15 minutes per workday shift.

**Progression:** 0→5 stars via YUM (CSD2) — performance-based XP gate separate from cash. Checklists optional for bonus YUM.

**Stickiness:** Buzz rating (demand pacing), menu rot (must rotate items), 24 boosters/detractors that change strategy, combo system.

**Economy inflation:** Harder menu items = more money + more difficulty. Self-regulating buzz drops if player overwhelmed.

**Grind avoidance:** YUM gates stars but not purchases — player controls build order. Optional challenges.

**Anti-pattern for us:** Real-time rush is the entire game. We borrow **menu rot / buzz as abstract day modifiers** (e.g., "Trending: smoky flavors today +10% tips") without timers.

---

### Good Pizza, Great Pizza

**Sources:** [Glitch Free Guides](https://glitchfreeguides.com/good-pizza-great-pizza-guide/), [Order types guide](https://www.nationhive.com/en/games/good-pizza-great-pizza/guide/order-types), [Pie Chart app wiki](https://good-pizza-great-pizza.fandom.com/wiki/Pie_Chart_app)

**Core loop:** Read customer dialog → assemble pizza to spec → bake → receive happiness % and tip.

**Session length:** 3–10 minutes per order; days contain multiple orders.

**Progression:** Chapters unlock sauces, toppings, equipment. Pie Chart app ties store rating to rent.

**Stickiness:** Cryptic/riddle orders, story chapters, rival (Alicante), 100+ unique customer personalities.

**Scoring:** Happiness meter (100% start, drops while waiting in line from 80%). Precision matters: 18 toppings = 3 per slice optimal. "What?" clarification costs patience.

**Applicability:** **Customer speaks preference, not exact recipe** — directly parallel to our taste-profile requests. Rating affects economics (rent). We adopt happiness→tips mapping but remove patience/timer decay.

---

### Papa's ___eria Series

**Sources:** [Order Station wiki](https://fliplinestudios.fandom.com/wiki/Order_Station), [Papa's Pizzeria FAQ](https://i.flipline.com/games/papaspizzeria/faq.html), [Papa's Wingeria FAQ](https://i.flipline.com/games/papaswingeria/faq.html)

**Core loop:** Order → multi-station pipeline (grill/build/garnish) → customer scores each station → combined % → tip.

**Scoring formula (critical for us):**

```
order_score = sum(station_percentages) / num_stations
tip = max_tip × (100 - 2 × (100 - order_score)) / 100
```

At 50% score → zero tips. At 100% → full tips. Star Customers multiply tips (×4/3 bronze, ×5/3 silver, ×2 gold, ×3 all-stars).

**Star thresholds:** ≥80% earns a star toward customer loyalty; <60% resets star meter.

**Applicability:** Our 0–10 dish match maps to Papa's 0–100% station average. Tip curve shape ( steep penalty below 70%) is a proven feel. We use **one composite match score** instead of per-station breakdown.

---

### Diner Dash

**Sources:** [Order-Fulfillment Games paper (FDG 2019)](https://www.kmjn.org/publications/OrderFulfillment_FDG19.pdf)

**Core loop:** Seat customers → take orders → deliver food → clear tables, all under time pressure. Satisfaction meter visualized via customer animation/color.

**Session:** 5–10 min/level.

**Progression:** Level map, purchasable decor (extends patience).

**Stickiness:** Combo chains for sequential actions.

**Anti-pattern:** Pure time-pressure. We borrow **decorative upgrades affecting passive bonuses** (e.g., decor → ambiance → slightly wider taste-match tolerance) without patience timers.

---

### Cooking Fever / Idle Restaurant Tycoon

**Sources:** [Cooking Fever Fandom restaurants table](https://cookingfever.fandom.com/wiki/Restaurants), [Noodle Arcade strategy guide](https://noodlearcade.com/cooking-fever-ultimate-strategy-guide), [Idle Restaurant Tycoon FAQs](https://www.idlerestauranttycoon.com/support/), [Level Winner IRT guide](https://www.levelwinner.com/idle-restaurant-tycoon-guide-tips-tricks-strategies/)

**Cooking Fever core loop:** Real-time multi-item cooking → 40 levels per restaurant → upgrade kitchen/food/decor → unlock next restaurant via XP + coins + gems.

**Economy inflation:** Upgrade costs outpace income between levels 40–60 ("coin wall"). Recommended: 3-star every level before advancing. Food quality first (+15% tips), then equipment speed.

**Idle Restaurant Tycoon:** Passive automation, **Collectible Cards** (permanent cross-restaurant bonuses), star-gated new restaurants. No classic prestige reset — cards provide permanent power.

**Applicability:** **Depth-first completion** before breadth. Permanent cross-run bonuses (our prestige multiplier). Upgrade priority: revenue-affecting first.

---

### Recettear

**Sources:** [Recettear Wikipedia](https://en.wikipedia.org/wiki/Recettear:_An_Item_Shop%27s_Tale), [Time Management wiki](https://recettear.fandom.com/wiki/Time_Management), [Story Mode debt schedule](https://recettear.fandom.com/wiki/New_Game_(Story_Mode))

**Core loop:** 4 day periods (Morning/Noon/Evening/Night) — shopkeep OR dungeon OR town per period.

**Progression gate:** Weekly debt: Day 8 (10k) → Day 15 (30k) → Day 22 (80k) → Day 29 (200k) → Day 36 (500k) = 820k total.

**Failure:** Miss payment → game over → restart Day 2 with 1,000 pix but keep merchant/adventurer levels.

**Applicability:** **Soft failure with retained meta-progress** mirrors our 0-star reset keeping prestige. Weekly pressure could inspire **optional weekly challenges** without mandatory debt.

---

### Stardew Valley

**Sources:** [Day Cycle wiki](https://stardewvalleywiki.com/Day_Cycle), [Energy wiki](https://stardewvalleywiki.com/Energy), [Design analysis](https://www.anuflora.com/game/?p=4575)

**Core loop:** 6 AM–2 AM day; energy-limited actions; sleep advances day and saves.

**Session:** 15–60 min/day.

**Progression:** Seasons (28 days), tool upgrades, community bundles, friendship.

**Stickiness:** "One more day" crop cycles, discovery, NPC stories.

**Applicability:** **Day summary screen** and "sleep to advance" pacing. Energy system **not applicable** (no stamina). Seasonal ingredient availability is a strong anti-repetition lever for our ingredient unlock schedule.

---

### Cooking Simulator / Overcooked / Restaurant Empire

**Cooking Simulator:** Physics-based cooking; career mode scenarios. Novelty wears thin without scenario variety. **Borrow:** recipe step vocabulary, not physics.

**Overcooked:** [GDC deep dive](https://www.gamedeveloper.com/design/game-design-deep-dive-building-truly-cooperative-play-in-i-overcooked-i-), [FDG paper](https://www.kmjn.org/publications/OrderFulfillment_FDG19.pdf). Co-op real-time; layout puzzles. **Anti-pattern** for solo tap-paced design.

**Restaurant Empire:** [Wikipedia](https://en.wikipedia.org/wiki/Restaurant_Empire), [IGN review](https://www.ign.com/articles/2003/05/28/restaurant-empire). Campaign scenarios, menu design, decor, staff hiring, cooking competitions. Closest PC ancestor to our layout + menu design goals. **Borrow:** grid placement, cuisine theming, scenario goals.

---

### Designing Tap-Paced Depth for 200–400 Hours

Without real-time timers, depth must come from **decision quality**, not **action speed**:

| Layer | Mechanism | Hour Budget |
|-------|-----------|-------------|
| **Composition mastery** | 100 ingredients × taste vectors; learning pairings | 40–80 h |
| **Customer archetypes** | 20+ preference templates; hidden secondary preferences | 20–40 h |
| **Menu/day modifiers** | Daily trend, weather flavor, VIP requests, food critic visits | 30–50 h |
| **Layout optimization** | Grid expansion, table count vs. day length tradeoff | 20–30 h |
| **Economy puzzles** | Ingredient budget vs. match quality vs. rating risk | 40–60 h |
| **Prestige loops** | 6-star reset cycles with exponential payout growth | 50–100 h |
| **Discovery** | ~1000 recipe book, ingredient unlock quests, kitchen upgrades | 30–50 h |

**Anti-repetition tactics (evidence-based):**
1. **Variable daily queue** — customer count = f(seating, rating, prestige), not fixed (Cooking Fever varies by level design).
2. **Rotating day modifiers** — CSD "Menu Rot" / boosters without requiring menu rotation fatigue.
3. **Emergent pairing learning** — Ahn flavor network creates "aha" moments when player discovers compound-sharing pairs.
4. **Optional constraints** — "No bitter ingredients today" challenge days (Shuffle Bistro-style synergy goals).
5. **Review/rating feedback loop** — Pie Chart-style visible rating affecting payout curve creates stakes without timers.

---

## 2. Game Economy Design

### Design Targets

| Parameter | Target | Rationale |
|-----------|--------|-----------|
| Total playtime | 200–400 hours | User requirement |
| Service days to first prestige | 25–40 days | Early reward hook |
| Service days between prestiges (mid-game) | 40–70 days | Growing mastery |
| Service days between prestiges (late-game) | 80–120 days | Long tail |
| Ingredient unlocks | ~100 | ~1 new ingredient every 2–4 days early, 5–8 days late |
| Kitchen upgrades | 12 | ~1 every 15–25 days |
| Soft reset loss | Money, ingredients, layout | Confirmed ruling |
| Permanent retention | Prestige count only | Confirmed ruling |

---

### Core Formulas

#### 1. Upgrade Cost (Exponential)

```
cost(n) = floor(base_cost × growth_rate^n)
```

| Upgrade Category | base_cost | growth_rate | n range | Example |
|------------------|-----------|-------------|---------|---------|
| Ingredient unlock | 150 | 1.14 | 0–99 | 10th ingredient: 150 × 1.14^9 ≈ 456 |
| Table/seating slot | 200 | 1.12 | 0–20 | 5th table: 200 × 1.12^4 ≈ 315 |
| Kitchen equipment (12 total) | 500 | 1.18 | 0–11 | 6th upgrade: 500 × 1.18^5 ≈ 1,140 |
| Grid expansion (tiles) | 300 | 1.15 | 0–15 | 8th expansion: 300 × 1.15^7 ≈ 796 |

**Why these constants:**
- `growth_rate` 1.12–1.18 is the idle-game sweet spot ([Game Developer: Math of Idle Games Part I](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i)).
- Ingredient rate 1.14 ensures ~100 unlocks span 250+ days at mid-game income.
- Equipment rate 1.18 makes 12 upgrades feel milestone-heavy.

**Bulk-buy closed form** (from Game Developer Part I):

```
total_cost(k items starting at level n) = base × growth^n × (growth^k - 1) / (growth - 1)
```

---

#### 2. Prestige Multiplier (Exponential — Confirmed Ruling)

```
prestige_multiplier(P) = prestige_base^P
```

**Recommended:** `prestige_base = 1.18`, `P` = prestige count (0, 1, 2, …).

| Prestige P | Multiplier | Interpretation |
|------------|------------|----------------|
| 0 | 1.00× | First run |
| 1 | 1.18× | +18% all payouts |
| 3 | 1.64× | Noticeable acceleration |
| 5 | 2.29× | Mid-game power |
| 10 | 5.23× | Late-game |
| 15 | 10.07× | Endgame |

**Why 1.18:** Compounds meaningfully (doubles ~every 4 prestiges) without breaking early balance. Slower than Cookie Clicker's per-chip 1% linear stack but faster than sqrt/log prestige curves that feel flat ([Game Developer Part III](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii)).

**Prestige trigger:** Restaurant rating reaches 6 stars → prestige +1, rating resets to 3.

---

#### 3. Base Payout Per Customer

```
base_payout(day) = floor(20 + 8 × day^0.55)
```

| Day | base_payout |
|-----|-------------|
| 1 | 28 |
| 10 | 45 |
| 50 | 72 |
| 100 | 95 |
| 200 | 118 |
| 400 | 145 |

Sub-linear exponent (0.55) prevents late-game number explosion while still growing.

---

#### 4. Rating Multiplier (0–6 Stars)

```
rating_multiplier(stars) = max(0, stars / 3)^1.3
```

| Stars | Multiplier | Effect |
|-------|------------|--------|
| 0 | 0.00× | Run lost → soft reset |
| 1 | 0.28× | Severe penalty |
| 2 | 0.62× | Struggling |
| 3 | 1.00× | Starting baseline |
| 4 | 1.40× | Good |
| 5 | 1.85× | Strong |
| 6 | 2.32× | Prestige threshold |

Exponent 1.3 makes high ratings rewarding but not mandatory early. Below 3 stars, payouts drop — creates recovery tension without timers.

**Star movement per customer:**
```
Δstars = (match_stars - 5) × 0.08
```
- Perfect 10 match → +0.40 stars
- Average 5 match → 0.00
- Poor 2 match → -0.24 stars

Clamp stars to [0, 6]. At 0 → soft reset. At 6 → prestige.

---

#### 5. Tip Calculation (Full Pipeline)

```
match_quality = dish_match_score / 10        # 0.0–1.0
tip = floor(
  base_payout(day)
  × rating_multiplier(stars)
  × prestige_multiplier(P)
  × (0.3 + 0.7 × match_quality^1.5)
)
```

The `0.3 + 0.7 × match^1.5` floor ensures even bad matches pay something (30% floor) but good matches dominate — similar to Papa's steep tip curve.

**Example:** Day 50, 4.2 stars, Prestige 2, match 8/10:
```
base = 72
rating_mult = (4.2/3)^1.3 = 1.52
prestige_mult = 1.18^2 = 1.39
match_factor = 0.3 + 0.7 × 0.8^1.5 = 0.3 + 0.501 = 0.801
tip = floor(72 × 1.52 × 1.39 × 0.801) = floor(122.1) = 122
```

---

#### 6. Day Structure & Customer Count

```
customers_per_day = min(seating_capacity, floor(3 + rating × 0.8 + P × 0.5 + day^0.2))
```

| Phase | Typical customers/day |
|-------|----------------------|
| Early (day 1–20) | 4–6 |
| Mid (day 50, 3★, P1) | 7–9 |
| Late (day 200, 4★, P5) | 10–12 |

Tap-paced: one customer at a time, player taps "Next customer" after serving. Day ends when queue empty. **No waiting timers.**

---

#### 7. Soft Reset (0 Stars)

On 0-star failure:
- **Lose:** All money, all ingredients (except starter set of 5), all furniture/layout, current rating.
- **Keep:** Prestige count P (permanent).
- **Restart at:** 3 stars, $100 starting cash, 5 starter ingredients (flour, salt, butter, onion, chicken), 4×4 grid, 2 tables.

---

### Content Unlock Pacing Schedule

| Milestone | Target Day | Gate |
|-----------|------------|------|
| First new ingredient | Day 2–3 | Tutorial complete |
| 10 ingredients | Day 25–35 | Economy |
| 25 ingredients | Day 60–80 | |
| 50 ingredients | Day 120–160 | |
| 100 ingredients | Day 280–350 | |
| All 12 kitchen upgrades | Day 180–250 | |
| First prestige | Day 25–40 | Hit 6 stars |
| Prestige 5 | Day 150–200 | |
| Prestige 10 | Day 350–400 | |

---

### Avoiding Pure Grind (200–400 Hours)

1. **Meaningful decisions every customer** — taste matching is a skill, not repetition.
2. **Discovery beats repetition** — new ingredients change the solution space.
3. **Prestige acceleration** — each cycle is faster, not just longer.
4. **Daily modifiers** — 5–10 rotating modifiers prevent identical days.
5. **Recipe book collection** — 1000 recipes as achievement/content, not required for progression.
6. **No mandatory replay farming** — income scales with skill (match quality) not time spent.

---

## 3. Flavor / Taste Profile Systems

### Scientific Foundations

#### Five Basic Tastes

| Taste | Primary stimuli | Example ingredients |
|-------|-----------------|---------------------|
| Sweet | Sugars | honey, carrot, corn |
| Salty | Na+ ions | soy sauce, anchovy, capers |
| Sour | Acids (H+) | lemon, vinegar, yogurt |
| Bitter | Alkaloids, polyphenols | dark greens, coffee, cocoa |
| Umami | Glutamate, nucleotides | mushroom, parmesan, tomato |

Sources: [Umami Information Center](https://www.umamiinfo.com/what/whatisumami/), [Ajinomoto basic tastes](https://www.ajinomoto.com/umami/why-is-umami-important-to-us), [Science of Taste guide](https://www.scienceoftaste.com/articles/understanding-flavor-profiles-cooking-guide/)

#### Aroma & Flavor Wheels

Aroma contributes ~80% of "flavor" perception. Standard culinary wheels organize descriptors into:
- **Earthy/musty:** mushroom, truffle, beet
- **Herbal/green:** basil, parsley, arugula
- **Floral:** lavender, rose
- **Fruity:** citrus, berry, apple
- **Spicy/pungent:** garlic, onion, chili
- **Smoky:** char, bacon, smoked paprika
- **Nutty:** almond, sesame, toasted grain
- **Marine:** fish, seaweed, oyster

The **Flavor Bible** (Page & Dornenburg) organizes pairings by ingredient → affinity list — a chef-curated compatibility graph, not numeric. Useful for validating our pairing adjacency matrix.

---

### Ahn et al. 2011 — Flavor Network

**Paper:** [Ahn YY et al. "Flavor network and the principles of food pairing." *Scientific Reports* 1, 196 (2011)](https://doi.org/10.1038/srep00196)  
**PDF:** [yongyeol.com/papers/ahn-flavornet-2011.pdf](https://www.yongyeol.com/papers/ahn-flavornet-2011.pdf)  
**Supplementary:** [bagrow.com/pdf/srep00196-s1.pdf](https://bagrow.com/pdf/srep00196-s1.pdf)

**Methodology summary:**
1. Built bipartite network: **381 recipe ingredients** ↔ **1,021 flavor compounds** (from Fenaroli's Handbook of Flavor Ingredients).
2. Projected to **ingredient-ingredient weighted network** where edge weight = count of shared flavor compounds.
3. For each recipe, computed mean shared compounds N_s across ingredient pairs.
4. Compared real recipes vs. randomized null model (preserving ingredient frequency).
5. **Finding:** Western cuisines **favor** compound-sharing pairs (food pairing hypothesis); East Asian cuisines **avoid** them.

**Implications for our game:**
- Ingredient pairs with high shared-compound count are **culinarily validated** pairings → bonus when combined in a dish.
- We can build an **affinity bonus** on top of taste-vector matching.
- Data limitation (acknowledged in paper): compound concentrations and detection thresholds not modeled.
- The 381-ingredient set is a subset — our 100 ingredients should map to this network where possible.

**Pairing score between ingredients i, j:**

```
compound_affinity(i, j) = |compounds(i) ∩ compounds(j)| / max(1, min(|Ci|, |Cj|))
```

Normalize to 0–1 across all pairs. Use as bonus in match scoring (see below).

---

### Proposed Numeric Schema

#### Design Principles

1. **Overlapping descriptors** — "bright," "rich," "savory" map to multiple axes so sentences compose naturally.
2. **Player-inspectable** — every unlocked ingredient shows full vector in UI.
3. **Customer requests use preferences, never dish names** — generated from preference vector, not recipe lookup.
4. **3–6 ingredient dishes** — aggregation must handle variable count.

---

#### Ingredient Vector (16 axes, each 0–10)

**Group A — Basic Tastes (5 axes)**

| Axis | Key | Description |
|------|-----|-------------|
| Sweet | `SW` | Sugars, caramelization |
| Salty | `SA` | Salt, brine, aged cheese |
| Sour | `SO` | Acid, fermentation tang |
| Bitter | `BI` | Bitter greens, cacao, char |
| Umami | `UM` | Savory depth, glutamate |

**Group B — Aroma Families (6 axes)**

| Axis | Key | Description |
|------|-----|-------------|
| Herbal | `HE` | Fresh green herbs, grass |
| Fruity | `FR` | Fruit, citrus, berry notes |
| Earthy | `EA` | Mushroom, root, beet |
| Smoky | `SM` | Char, smoke, toast |
| Pungent | `PU` | Garlic, onion, sulfur |
| Nutty | `NU` | Nuts, seeds, toasted grain |

**Group C — Mouthfeel & Intensity (5 axes)**

| Axis | Key | Description |
|------|-----|-------------|
| Rich/Fatty | `RI` | Butter, cream, oil mouthfeel |
| Light/Clean | `LI` | Bright, refreshing, low fat |
| Heat/Spice | `HT` | Capsaicin, pepper, chili |
| Crunch | `CR` | Textural crisp (raw veg, nuts) |
| Temperature | `TE` | −1=cold, 0=neutral, +1=hot (categorical stored as −1/0/+1) |

**Total stored values:** 15 continuous (0–10) + 1 categorical (−1, 0, +1).

---

#### Example Ingredient Vectors

| Ingredient | SW | SA | SO | BI | UM | HE | FR | EA | SM | PU | NU | RI | LI | HT | CR | TE |
|------------|----|----|----|----|----|----|----|----|----|----|----|----|----|----|----|-----|
| Lemon | 2 | 0 | 9 | 1 | 1 | 2 | 8 | 0 | 0 | 1 | 0 | 0 | 9 | 0 | 0 | −1 |
| Butter | 1 | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 1 | 9 | 1 | 0 | 0 | 0 |
| Garlic | 1 | 1 | 0 | 2 | 4 | 3 | 0 | 2 | 0 | 9 | 0 | 2 | 2 | 2 | 1 | +1 |
| Mushroom | 1 | 1 | 1 | 1 | 8 | 2 | 0 | 9 | 1 | 2 | 2 | 1 | 3 | 0 | 2 | +1 |
| Honey | 10 | 0 | 0 | 0 | 0 | 1 | 3 | 0 | 0 | 0 | 0 | 1 | 4 | 0 | 0 | 0 |
| Chili pepper | 1 | 0 | 1 | 2 | 2 | 1 | 2 | 0 | 0 | 4 | 0 | 1 | 3 | 9 | 1 | +1 |

Vectors are **authored manually** during content pipeline, validated against culinary references (Flavor Bible pairings, USDA food categories). Compound affinity data from Ahn network used as QA check.

---

#### Dish Vector Aggregation (3–6 Ingredients)

**Recommended: Weighted mean + soft-max for character-defining axes.**

For continuous axes (all except TE):

```
dish_axis = (1 - α) × mean(ingredient_axis values) + α × max(ingredient_axis values)
```

**α = 0.25** for tastes and mouthfeel axes (SW, SA, SO, BI, UM, RI, LI, CR).  
**α = 0.40** for aroma axes (HE, FR, EA, SM, PU, NU) — one strong aromatic ingredient should dominate.  
**α = 0.55** for HT — one chili should make a dish hot.

For temperature TE: use **mode** (most common); tie-break toward +1 (hot served dishes default).

**Why not pure mean?** Pure mean dilutes distinctive ingredients (one chili in 6 ingredients barely registers). Pure max over-rewards single outliers. Blend matches player intuition.

**Why not weighted by portion?** Tap-paced game has no portion control — all ingredients equal weight simplifies UX.

---

#### Customer Preference Generation

Each customer has a **preference vector** `pref` (same 16 axes) plus **avoid masks** and **natural language templates**.

**Generation algorithm:**

```
1. Roll customer archetype (20 templates: "Comfort Seeker", "Adventurous Eater", etc.)
2. Set 2–4 primary axes to desired bands [low/mid/high]:
   - low = target 0–3, mid = 3–6, high = 7–10
3. Optionally set 1 avoid axis (desire < 3)
4. Add ±1 random jitter per axis
5. Select phrase templates for each primary axis band
6. Compose bubble text from 2–3 phrases (never mention dish names)
```

**Descriptor phrase table (overlapping schemas):**

| Axis | High (7–10) | Mid (4–6) | Low (0–3) |
|------|-------------|-----------|-----------|
| UM | "something really savory" | "a little umami depth" | — |
| SO | "bright and tangy" | "a touch of acid" | "nothing too sharp" |
| SW | "a hint of sweetness" | — | "not sweet at all" |
| RI | "rich and indulgent" | "moderately hearty" | "light and clean" |
| LI | "fresh and refreshing" | — | — |
| SM | "smoky depth" | "a whisper of char" | — |
| HT | "spicy kick" | "gentle warmth" | "mild, no heat" |
| HE | "herbal and fresh" | — | — |
| FR | "fruity notes" | — | — |
| EA | "earthy flavors" | — | — |
| PU | "bold and garlicky" | — | "nothing too pungent" |
| CR | "some crunch" | — | "soft textures only" |

**Example customer bubbles:**
- "I'm craving something **really savory** with a **bright, tangy** finish. Nothing too sweet."
- "Give me **rich and indulgent** with a **whisper of char**. Keep it **mild, no heat**."
- "Something **herbal and fresh** — **light and clean**, please."

---

#### Match Quality → 0–10 Star Score

**Step 1: Axis satisfaction (per axis a):**

```
if avoid[a] and dish[a] > 4:
  sat[a] = 0
elif pref_band[a] == "high":
  sat[a] = clamp(dish[a] / 10, 0, 1)
elif pref_band[a] == "mid":
  sat[a] = 1 - abs(dish[a] - 5) / 5
elif pref_band[a] == "low":
  sat[a] = 1 - clamp(dish[a] / 5, 0, 1)
else:
  sat[a] = 0.7  # unmentioned axis: neutral
```

**Step 2: Weighted satisfaction (primary axes weight 2×, avoid violations weight 3×):**

```
weighted_sat = (2 × Σ sat[primary] + Σ sat[other] - 3 × avoid_violations) / (2 × |primary| + |other|)
```

**Step 3: Compound affinity bonus (0–1):**

```
affinity_bonus = mean(compound_affinity(i,j)) for all pairs in dish
```

**Step 4: Final score:**

```
match_stars = clamp(10 × (0.85 × weighted_sat + 0.15 × affinity_bonus), 0, 10)
```

Round to 1 decimal for display.

---

#### Worked Example

**Customer request:** "Something **really savory** with **bright, tangy** notes. **Light and clean** — not rich."

**Preference encoding:**
- Primary high: UM (target 8), SO (target 8), LI (target 8)
- Primary low: RI (target ≤ 3)
- Avoid: none

**Player dish:** Lemon (4) + Mushroom (1) + Garlic (1) — 3 ingredients.

**Dish vector (α=0.25 tastes, 0.40 aroma, 0.55 HT):**
- UM: 0.75×4.0 + 0.25×8 = 5.0 (mushroom pulls up)
- SO: 0.75×3.3 + 0.25×9 = 4.75
- LI: 0.75×4.7 + 0.25×9 = 5.75
- RI: 0.75×1.0 + 0.25×9 = 3.0

**Satisfaction:**
- UM: 5.0/10 = 0.50 (wanted high, got mid) — weak
- SO: 4.75/10 = 0.475 — weak
- LI: 5.75/10 = 0.575 — moderate
- RI low: 1 - 3.0/5 = 0.40 — barely passes "not rich"

**weighted_sat ≈ 0.49 → match_stars ≈ 4.2/10** — mediocre review.

**Better dish:** Lemon + Mushroom + Parsley (hypothetical: UM=7, SO=8, LI=8, RI=1) → match_stars ≈ 8.5/10.

---

## 4. Recipe Data Sources

### Dataset Comparison

| Source | License | Size | Format | Access | Risk for Our Game |
|--------|---------|------|--------|--------|-------------------|
| **USDA FoodData Central** | **CC0 1.0** | 300k+ foods | JSON API, CSV | [fdc.nal.usda.gov](https://fdc.nal.usda.gov/) | ✅ **Safe** — ingredient names, categories, nutrition. No recipe prose. |
| **RecipeNLG** | **Non-commercial research only** | ~2.2M recipes | JSON | [recipenlg.cs.put.poznan.pl](https://recipenlg.cs.put.poznan.pl/dataset) | ❌ **Blocked** — NC + indemnification clause |
| **Recipe1M / Recipe1M+** | **CC BY-NC-SA 4.0** | 1M+ recipes, 13M images | LMDB, JSON | [im2recipe.csail.mit.edu](http://im2recipe.csail.mit.edu/) | ❌ **Blocked** — NC + SA + research-only access |
| **Food.com (Kaggle)** | **Ambiguous** — "© Original Authors" on primary dataset; some mirrors claim CC0 | 180k–522k recipes | CSV | [kaggle.com/shuyangli94/food-com-recipes-and-user-interactions](https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions) | ⚠️ **High risk** — scraped user content, no clear license |
| **Open Food Facts** | **ODbL + DbCL** (database); images **CC BY-SA** | 4M+ products | JSON API | [openfoodfacts.org](https://world.openfoodfacts.org/) | ⚠️ **Not CC0** — share-alike obligations |
| **TheMealDB** | **Custom ToS** — free dev API; **paid ($10 lifetime) for public apps** | 747 meals, 961 ingredients | REST JSON | [themealdb.com](https://www.themealdb.com/) | ⚠️ **OK for dev** — $10 supporter key for production; artwork has separate CC flags per item |
| **Wikibooks Cookbook** | **CC BY-SA 4.0 + GFDL** | 1000s of recipes | Wikitext/HTML | [en.wikibooks.org/wiki/Cookbook](https://en.wikibooks.org/wiki/Cookbook) | ⚠️ **SA risk** — derivative works must be CC BY-SA |
| **Schema.org recipe corpora** | Varies by host | Varies | JSON-LD | Various | ⚠️ Check per-source |

---

### Recommended Pipeline for ~1000 Recipes + ~100 Ingredients

#### ~100 Ingredient Master List → **USDA FoodData Central (CC0)**

1. Query FDC for whole-food entries across food groups: proteins, dairy, grains, vegetables, fruits, herbs/spices, oils, fermented items.
2. Select ~100 commonly understood cooking ingredients (not branded products).
3. Author flavor vectors manually (Section 3 schema).
4. Map to Ahn 2011 ingredient names where possible for compound affinity.

**Attribution (requested, not required):** "Ingredient data derived from USDA FoodData Central (CC0)."

#### ~1000 Recipe Corpus → **Hybrid: TheMealDB structure + original prose + Wikibooks validation**

| Step | Action |
|------|--------|
| 1 | Purchase TheMealDB supporter key ($10 lifetime): [themealdb.com](https://www.themealdb.com/index.php) |
| 2 | Export 747 meal ingredient lists as **structural templates** (ingredient names + counts) |
| 3 | Use Wikibooks + public-domain culinary references to **validate** that ingredient combos are real |
| 4 | **Rewrite all recipe titles and descriptions in original words** — do NOT ship third-party recipe prose |
| 5 | Generate remaining ~250 recipes by combining FDC ingredients using Ahn compound-affinity ≥ threshold |
| 6 | QA: every recipe uses 3–6 ingredients from master list; no duplicate combos |

**Why not ship RecipeNLG/Food.com text?** License prohibits commercial use or carries copyright ambiguity.

**Why TheMealDB?** Small but curated real dishes with ingredient lists; $10 unlocks production API. Check `strCreativeCommons` tag on images — **do not use their artwork** (use CC0 art from Section 5).

**Wikibooks usage:** Reference-only for culinary plausibility. If any Wikibooks text is included, the recipe collection must be released CC BY-SA — **avoid by rewriting**.

---

## 5. CC0 Art & Audio Assets

**User requirement: CC0 ONLY.** Assets below verified as CC0 or flagged.

### ✅ Verified CC0 Sources

| Category | Asset | URL | Notes |
|----------|-------|-----|-------|
| **Food icons (pixel)** | Kenney Pixel Platformer Food Expansion (110 items) | https://kenney.nl/assets/pixel-platformer-food-expansion | CC0 stated on page |
| **UI (pixel)** | Kenney Pixel UI Pack | https://kenney.nl/assets/pixel-ui-pack | CC0 |
| **UI (pixel)** | Kenney UI Pack - Pixel Adventure | https://kenney.nl/assets/ui-pack-pixel-adventure | CC0 |
| **Tileset (top-down)** | Kenney Tiny Town | https://kenney.nl/assets/tiny-town | CC0 (Kenney standard) |
| **Tileset (top-down)** | Kenney RPG Base | https://kenney.nl/assets/rpg-base | CC0 |
| **Tileset (top-down)** | Kenney RPG Urban Pack | https://kenney.nl/assets/rpg-urban-pack | CC0 |
| **Tileset template** | RGS_Dev Free CC0 Top Down Tileset (16×16) | https://rgsdev.itch.io/free-cc0-top-down-tileset-template-pixel-art | CC0 stated |
| **Characters** | Kenney Pixel Platformer (includes characters) | https://kenney.nl/assets/pixel-platformer | CC0, 18×18 |
| **SFX** | Kenney RPG Audio (50 files) | https://kenney.nl/assets/rpg-audio | CC0 |
| **SFX** | Kenney Interface Sounds | https://kenney.nl/assets/interface-sounds | CC0 |
| **SFX** | Kenney UI Audio | https://kenney.nl/assets/ui-audio | CC0 |
| **Music** | Kenney Music Jingles (85 tracks) | https://kenney.nl/assets/music-jingles | CC0 |
| **Music loops** | Kenney Music Loops | https://kenney.nl/assets/category:Audio | CC0 |
| **OpenGameArt CC0 list** | Curated top-down tilesets | https://opengameart.org/content/top-down-assets-1 | Filter CC0 only |

### ⚠️ NOT CC0 — DO NOT USE

| Asset | URL | License | Issue |
|-------|-----|---------|-------|
| **LimeZu Modern Interiors** | https://limezu.itch.io/moderninteriors | CC-BY 4.0 (paid); free version = private use only | ❌ Not CC0; free version forbids commercial |
| **LimeZu Serene Village** | https://limezu.itch.io/serenevillagerevamped | CC-BY 4.0 | ❌ Requires attribution; not CC0 |
| **CraftPix freebies** | https://craftpix.net/freebies/ | Proprietary free license | ❌ Not CC0 (royalty-free ≠ public domain) |
| **Game-icons.net (most icons)** | https://game-icons.net/ | CC-BY 3.0 (most authors) | ❌ Only Viscious Speed & Zeromancer folders are CC0 |
| **aRdaonur Cozy Cafe Pack** | https://ardaonur.itch.io/cozy-cafe-pixel-assets | Claims CC0 but **$2.50 minimum** | ⚠️ Verify license file in download; paid gate |
| **0_mem0ry Professional Kitchen Set** | https://0-mem0ry.itch.io/professional-kitchen-set-free | **No explicit license stated** | ❌ Avoid until license confirmed |
| **OpenGameArt 16×16 indoor baseline** | https://opengameart.org/content/16x16-indoor-rpg-tileset-the-baseline | CC-BY 3.0 (Redshrike) | ❌ Attribution required |
| **OpenGameArt Kitchen Assets (LetsCookJam)** | https://opengameart.org/content/kitchen-assets-for-letscookjam | CC-BY (attribution requested) | ❌ Not CC0 |
| **TheMealDB artwork** | https://www.themealdb.com/ | Mixed; check `strCreativeCommons` per item | ❌ Do not use — use Kenney food icons instead |
| **Pixabay** | https://pixabay.com/ | Pixabay License (not CC0) | ❌ Not CC0 |
| **Freesound (most)** | https://freesound.org/ | CC0 / CC-BY / CC-BY-NC mixed | ⚠️ Filter license=Creative Commons 0 only |

### Freesound CC0 Filtering

Search with license filter "Creative Commons 0" at [freesound.org/search](https://freesound.org/search/?f=license:%22Creative+Commons+0%22). Verify each download page shows **CC0**.

### Recommended Asset Stack (All CC0)

| Need | Primary | Supplement |
|------|---------|------------|
| Restaurant interior tiles | Kenney Tiny Town + RPG Base | RGS_Dev 16×16 template for gaps |
| Kitchen equipment | Kenney RPG Urban (furniture-like tiles) | Custom 16×16 edits in Aseprite |
| Food/ingredient icons | Kenney Pixel Platformer Food Expansion | — |
| Customer sprites | Kenney Pixel Platformer characters | Recolor for variety |
| UI | Kenney Pixel UI Pack | — |
| SFX | Kenney RPG Audio + Interface Sounds | Freesound CC0-filtered extras |
| Music | Kenney Music Jingles + Loops | — |

---

## 6. Free Web Hosting for a Static Browser Game

### Comparison Table

| Platform | Free Bandwidth | Build Limits | Custom Domain | HTTPS | Git Deploy | PWA/SW | Notes |
|----------|---------------|--------------|---------------|-------|------------|--------|-------|
| **Cloudflare Pages** | **Unlimited** | 500 builds/mo, 20k files, 25 MiB/file | ✅ 100 domains | ✅ Auto | ✅ GitHub/GitLab | ✅ `_headers`, `_worker.js` | Best free tier |
| **GitHub Pages** | ~100 GB soft | 10 builds/hr soft; 1 GB repo | ✅ | ✅ Auto | ✅ Native | ✅ (manual SW) | [ToS restricts commercial/SaaS on free](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages) |
| **Netlify** | 100 GB/mo | 300 credits/mo | ✅ | ✅ Auto | ✅ | ✅ | Site pauses if exceeded |
| **Vercel** | 100 GB/mo | Hobby tier | ✅ | ✅ Auto | ✅ | ✅ | Next.js optimized |
| **itch.io** | CDN, no published cap | 500 MB total HTML5, 200 MB/file, 1000 files | ❌ (subdomain only) | ✅ | ❌ (upload zip) | Limited | Great for discovery, not primary |

Sources: [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [HostDir 2026 comparison](https://hostdir.net/blog/static-hosting-compared-2026), [FreeHostsFinder](https://freehostsfinder.com/github-pages-vs-netlify-vs-cloudflare-pages/), [itch.io HTML5 docs](https://itch.io/docs/creators/html5)

### PWA / Service Worker Support

All recommended hosts serve static files — PWA works via:
- `manifest.webmanifest`
- Service worker registered from `index.html`
- `_headers` (Cloudflare/Netlify) or `.htaccess` for cache control

Cloudflare Pages supports `_headers` and `_redirects` natively.

### Recommendation

| Role | Platform | Why |
|------|----------|-----|
| **Primary** | **Cloudflare Pages** | Unlimited bandwidth, free HTTPS, custom domain, PR previews, no commercial ToS restriction |
| **Backup** | **GitHub Pages** | Zero-config if already on GitHub; sufficient for low-traffic fallback |
| **Discovery mirror** | itch.io | Upload downloadable + HTML5 embed for visibility; not primary host |

---

## 7. Browser Save Persistence Without Login

### iOS Safari Storage Reality (Critical)

**Sources:**
- [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [WebKit: Tracking Prevention (7-day cap)](https://webkit.org/tracking-prevention/)
- [WebKit Bug 209563 fix — persist() honored](https://github.com/WebKit/WebKit/pull/48369)
- [MDN: StorageManager.persist()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)

#### Key Facts

| Topic | Behavior on iOS Safari |
|-------|------------------------|
| **7-day script storage eviction** | If user does not interact with origin for 7 days of Safari use, **all script-writable storage deleted**: IndexedDB, localStorage, sessionStorage, service worker cache |
| **Affected storage** | IndexedDB, localStorage, sessionStorage, Media keys, SW registrations |
| **NOT affected** | HTTP cookies set by **server** (not document.cookie) |
| **Add to Home Screen (PWA)** | Home screen web app origin is **exempt from 7-day cap** — ITP skips it; storage isolated from Safari |
| **navigator.storage.persist()** | Requests persistent storage; if granted, origin **exempt from proactive eviction** (including 7-day rule) per MDN and WebKit fix (2024) |
| **Quota** | Per-origin ~1 GiB initial on Safari; prompts for more if exceeded |
| **Private Browsing** | Ephemeral — all storage cleared on close |

#### localStorage vs IndexedDB

| Feature | localStorage | IndexedDB |
|---------|-------------|-----------|
| Capacity | ~5 MB | Much larger (up to quota) |
| Data types | Strings only | Structured, binary, indexes |
| Performance | Sync API (blocks main thread) | Async |
| Eviction | Same 7-day rule | Same 7-day rule |
| iOS reliability | Historically buggy | More reliable for large saves |

**Recommendation:** **IndexedDB** via `idb-keyval` (2 KB wrapper) or Dexie.js for structured save schema.

---

### Recommended Save Architecture

```
┌─────────────────────────────────────────┐
│           SaveManager                   │
├─────────────────────────────────────────┤
│ 1. Primary: IndexedDB ("restaurant-save")│
│ 2. On boot: navigator.storage.persist() │
│ 3. Export: LZ-string compressed JSON    │
│    → base64 "Save Code" for user backup  │
│ 4. Import: validate schema version       │
│ 5. Auto-save: after each service day     │
└─────────────────────────────────────────┘
```

#### Implementation Checklist

1. **On first load:** Call `navigator.storage.persist()` — log result; show user tip if denied.
2. **Prompt Add to Home Screen** after ~3 service days (iOS persistence boost).
3. **Auto-save** to IndexedDB after every day summary.
4. **Export save code:** Settings → "Backup Save" → copy base64 string (~2–10 KB compressed).
5. **Import save code:** Settings → paste → validate checksum + schema version.
6. **Schema versioning:** Include `saveVersion` field for migration.
7. **Do NOT rely on localStorage alone.**

#### Save Code Format

```
RS1.<base64url(LZString.compressToUTF8(JSON.stringify(saveData)))>
```

Prefix `RS1` = Restaurant Simulator schema v1.

#### User-Facing Warnings (Settings Screen)

> "Your progress is saved in this browser. To keep it safe:
> 1. Add this app to your Home Screen
> 2. Export a Save Code regularly
> 3. Playing in Private Browsing will not save progress"

---

## 8. Mobile-First Tech Stack

### iPhone 17 Target Specs

**Sources:** [Apple iPhone 17 Tech Specs](https://support.apple.com/en-us/125089), [Apple UK specs](https://www.apple.com/uk/iphone-17/specs/)

| Spec | Value |
|------|-------|
| Screen | 6.3" OLED (6.27" viewable rect) |
| Resolution | **2622 × 1206 px** (@ 460 ppi) |
| Logical CSS (approx) | **393 × 852 pt** (@ 3× scale) |
| Aspect ratio | ~19.5:9 |
| Refresh | 120 Hz ProMotion |
| Safe areas | Dynamic Island top, home indicator bottom |
| Browser | Safari (WebKit) |

**Design canvas:** 390×844 CSS px (standard modern iPhone logical width) with `viewport-fit=cover`.

---

### Rendering Approach Comparison

| Approach | Bundle Size | Mobile 60fps | Touch/DnD | Pixel Art | Dev Velocity | Verdict |
|----------|-------------|--------------|-----------|-----------|--------------|---------|
| **Plain DOM/CSS Grid** | ~0 KB | ✅ for <200 tiles | ✅ Native Pointer Events | ⚠️ Scaling blurs pixels | ✅ Fastest | Good for UI-heavy |
| **Canvas 2D** | ~0 KB | ✅ | ⚠️ Manual hit tests | ✅ Crisp with `image-rendering: pixelated` | ⚠️ Medium | Good for single canvas |
| **PixiJS 8** | ~125 KB gzip (tree-shaken) | ✅ | ✅ Built-in | ✅ Excellent | ✅ Good | **Best balance** |
| **Phaser 3** | ~274 KB gzip | ✅ | ✅ Arcade physics | ✅ Good | ✅ Fast for games | Overkill bundle |
| **React + Canvas hybrid** | ~150–200 KB total | ✅ | ✅ DOM UI + Canvas game | ✅ | ✅ Excellent | **Recommended** |

Sources: [Phaser vs PixiJS comparison](https://generalistprogrammer.com/comparisons/phaser-vs-pixijs), [DEV: PixiJS bundle optimization](https://dev.to/scott_winter_77ced0700c92/from-the-40s-to-97-optimizing-a-nextjs-webgl-game-b01), [Grid Tetris CSS experiment](https://github.com/nickgirardo/grid-tetris)

**Grid-specific note:** A 12×12 restaurant grid = 144 tiles — well within DOM performance for **tap-paced** updates (only changed cells re-render). However, **unified pixel aesthetic** favors a single Canvas/PixiJS layer with `image-rendering: pixelated`.

---

### Mobile Safari UX Requirements

| Requirement | Implementation |
|-------------|----------------|
| Viewport | `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` |
| Height | `100svh` (stable) for game shell; avoid raw `100vh` ([web.dev viewport units](https://web.dev/blog/viewport-units)) |
| Safe areas | `padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)` ([WebKit iPhone X guide](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)) |
| Touch targets | Minimum **44×44 CSS px** ([WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)) |
| Prevent zoom | `touch-action: manipulation` on game surface; **do NOT** use `user-scalable=no` |
| Prevent rubber-band | `overscroll-behavior: none` on body; `position: fixed` game container |
| Double-tap zoom | `touch-action: manipulation` eliminates 300ms delay and double-tap zoom |
| Pointer input | Pointer Events (not legacy touch handlers) for unified mouse/touch |
| Pixel crisp | `canvas { image-rendering: pixelated; }` |

---

### Definitive Stack Recommendation

```
┌──────────────────────────────────────────────────────┐
│  Vite 6 + TypeScript 5                               │
│  ├── PixiJS 8 (tree-shaken: Renderer, Container,     │
│  │    Sprite, Texture, Graphics) — restaurant grid   │
│  ├── DOM/HTML overlay — menus, dialogs, save UI      │
│  ├── CSS Modules — layout shell, safe areas          │
│  ├── Zustand — game state (lightweight, no boilerplate)│
│  ├── idb-keyval — IndexedDB save persistence         │
│  └── LZ-String — save code compression               │
├──────────────────────────────────────────────────────┤
│  PWA: vite-plugin-pwa (workbox, offline shell)       │
│  Deploy: Cloudflare Pages                            │
│  Target: 390×844 CSS px, 16×16 tile grid (integer scale 2× = 32px tiles) │
└──────────────────────────────────────────────────────┘
```

**Why not Phaser 3?** 2× bundle size for features we won't use (physics, scene manager, arcade). Our game is turn-based — PixiJS rendering + custom state machine is sufficient.

**Why not pure DOM?** Pixel art at 16×16 needs crisp scaling; Canvas/PixiJS handles this cleanly. Drag-and-drop furniture on grid works via PixiJS pointer events with snap logic.

**Estimated bundle:** ~180 KB gzip total (PixiJS ~125 KB + app ~55 KB) — loads in <2s on 4G.

**Tile sizing for iPhone 17:** 12×12 grid × 32px/tile = 384px — fits 390px width with safe-area padding.

---

## 9. Recommendations Summary

| # | Area | Recommendation |
|---|------|----------------|
| **1** | **Reference design** | **Chef RPG** day-cycle + Prestige + recipe discovery as primary model. **Papa's** tip/scoring curve for match→money. **Good Pizza** preference-dialog (not dish names). **Recettear** soft-failure loop. **Avoid** Overcooked/Diner Dash/Cooking Fever real-time pressure. Depth via taste-matching skill, daily modifiers, layout optimization, and prestige acceleration — not speed. |
| **2** | **Economy** | Upgrade costs: `cost = base × 1.12–1.18^n`. Prestige payout: **`1.18^P`**. Rating multiplier: **`(stars/3)^1.3`**. Tips: `base_payout(day) × rating × prestige × match_curve`. First prestige day 25–40; 200–400 hours total. 0-star soft reset loses money/ingredients/layout, keeps prestige. |
| **3** | **Flavor system** | **16-axis schema** (5 tastes + 6 aromas + 5 mouthfeel including categorical temperature). Dish = **75% mean + 25–55% max** blend (higher α for aromatics/heat). Customer requests from **2–4 primary axis phrase templates**, never dish names. Score 0–10 via weighted axis satisfaction + 15% Ahn compound-affinity bonus. |
| **4** | **Recipe data** | **Ingredients:** USDA FoodData Central (CC0). **Recipes:** TheMealDB ($10) for structure + **original rewritten prose** + Ahn-validated combos. **Do NOT ship** RecipeNLG, Recipe1M, or Food.com text. Wikibooks for QA only. |
| **5** | **Art/audio** | **Kenney.nl only** for all assets (CC0): Tiny Town + RPG Base tiles, Pixel Platformer Food Expansion icons, Pixel Platformer characters, Pixel UI Pack, RPG Audio + Music Jingles. **Avoid** LimeZu, CraftPix, Game-icons.net (mostly CC-BY), TheMealDB images. Freesound: CC0 filter only. |
| **6** | **Hosting** | **Primary: Cloudflare Pages** (unlimited bandwidth, PWA-friendly). **Backup: GitHub Pages.** itch.io as optional discovery mirror. |
| **7** | **Save persistence** | **IndexedDB via idb-keyval** + **`navigator.storage.persist()`** on boot + **LZ-compressed Save Code** export/import. Prompt Add to Home Screen on iOS. Warn about Private Browsing. Do not rely on localStorage alone. |
| **8** | **Tech stack** | **Vite + TypeScript + PixiJS 8 (tree-shaken) + DOM overlay + Zustand + idb-keyval.** 390×844 CSS px, 16×16 tiles at 2× integer scale, `viewport-fit=cover`, `100svh`, 44px touch targets, Pointer Events. Target ~180 KB gzip bundle. |

---

*Research completed 2026-07-24. All URLs verified at time of writing.*
