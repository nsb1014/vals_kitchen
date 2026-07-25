/**
 * Prestige pacing constants — single source for balance tuning.
 * Product rules in PRD §7.4, §10.1; analytic checks in prestige-pacing.test.ts.
 */

/** Assumed real-time minutes per service day for hour projections (PRD §10). */
export const MINUTES_PER_GAME_DAY = 10;

/** Design aspiration for total playtime (hours) — not a CI pass/fail gate. PRD §2, §10.1. */
export const DESIGN_PLAYTIME_HOURS_ASPIRATION_MIN = 200;
export const DESIGN_PLAYTIME_HOURS_ASPIRATION_MAX = 400;

/** Loose sanity bounds for deep sim — catches catastrophic pacing regressions only. */
export const OBSERVED_HOURS_SANITY_MIN = 20;
export const OBSERVED_HOURS_SANITY_MAX = 2000;

/**
 * Rating delta resistance per prestige level.
 * multiplier(P) = max(floor, 1 / (1 + P × k))
 * P=0 leaves cycle 1 unchanged (~5–8 days); higher P slows 3→6 climb.
 */
export const PRESTIGE_RATING_RESISTANCE_PER_LEVEL = 0.6;

/** Winnability floor — positive match stars always yield positive rating delta. */
export const PRESTIGE_RATING_DELTA_FLOOR = 0.06;

/**
 * Purchase cost growth per prestige: effectiveCost = baseCost × growth^P.
 * Gates unlock pacing on later cycles without blocking purchases entirely.
 */
export const PRESTIGE_ECONOMY_COST_GROWTH = 1.085;

/** Cap on purchase cost multiplier so late prestige cycles stay purchasable. */
export const PRESTIGE_ECONOMY_COST_CEILING = 10;

/**
 * Deep-sim verification horizon (prestige cycles). Simulation bound for CI — not a
 * designed content end state; prestige has no hard cap in product rules (PRD §10.1.1).
 */
export const SIMULATION_PRESTIGE_CYCLE_CAP = 30;

/** @deprecated Use SIMULATION_PRESTIGE_CYCLE_CAP — kept for existing imports. */
export const TARGET_PRESTIGE_CYCLE_COUNT = SIMULATION_PRESTIGE_CYCLE_CAP;

/** First-cycle target length (days) under competent play at P=0. */
export const BASE_FIRST_CYCLE_DAYS = 4;

/**
 * Calibrated analytic cycle-length curve (competent play, seed 424242).
 * projectedCycleDays(P) = round(min(CAP, BASE + LINEAR×P + QUAD×P²))
 * Re-fit when resistance/economy constants change; deep sim asserts agreement.
 */
export const CYCLE_LENGTH_LINEAR_GROWTH = 2.0;
export const CYCLE_LENGTH_QUADRATIC_GROWTH = 0.03;
export const CYCLE_LENGTH_CAP = 68;

/** Max relative error allowed per cycle between analytic proxy and deep sim. */
export const ANALYTIC_SIM_PER_CYCLE_TOLERANCE = 0.15;

/** Max relative error allowed on cumulative days between analytic proxy and deep sim. */
export const ANALYTIC_SIM_CUMULATIVE_TOLERANCE = 0.1;

export function prestigeRatingDeltaMultiplier(prestige: number): number {
  if (prestige <= 0) return 1;
  const raw = 1 / (1 + prestige * PRESTIGE_RATING_RESISTANCE_PER_LEVEL);
  return Math.max(PRESTIGE_RATING_DELTA_FLOOR, raw);
}

export function prestigeEconomyCostMultiplier(prestige: number): number {
  if (prestige <= 0) return 1;
  return Math.min(
    PRESTIGE_ECONOMY_COST_CEILING,
    Math.pow(PRESTIGE_ECONOMY_COST_GROWTH, prestige),
  );
}

export function gameDaysToRealHours(gameDays: number): number {
  return (gameDays * MINUTES_PER_GAME_DAY) / 60;
}

/** Analytic proxy for competent-play cycle length at prestige P (monotonic by construction). */
export function projectedCycleDays(prestige: number): number {
  const raw =
    BASE_FIRST_CYCLE_DAYS +
    CYCLE_LENGTH_LINEAR_GROWTH * prestige +
    CYCLE_LENGTH_QUADRATIC_GROWTH * prestige * prestige;
  return Math.max(3, Math.round(Math.min(CYCLE_LENGTH_CAP, raw)));
}

export interface ProjectedPrestigeCycle {
  cycle: number;
  prestigeFrom: number;
  daysInCycle: number;
  cumulativeDays: number;
  cumulativeHours: number;
}

export function projectedPrestigeCurve(cycleCount: number): ProjectedPrestigeCycle[] {
  const rows: ProjectedPrestigeCycle[] = [];
  let cumulativeDays = 0;
  for (let cycle = 1; cycle <= cycleCount; cycle++) {
    const prestigeFrom = cycle - 1;
    const daysInCycle = projectedCycleDays(prestigeFrom);
    cumulativeDays += daysInCycle;
    rows.push({
      cycle,
      prestigeFrom,
      daysInCycle,
      cumulativeDays,
      cumulativeHours: gameDaysToRealHours(cumulativeDays),
    });
  }
  return rows;
}

/** @deprecated Use projectedCycleDays — kept for deep sim cross-check slack. */
export function expectedMinCycleDays(prestige: number): number {
  return projectedCycleDays(prestige);
}
