import { prestigeEconomyCostMultiplier } from '../balance/prestige-pacing.ts';

export function upgradeCost(base: number, rate: number, n: number): number {
  return Math.floor(base * Math.pow(rate, n));
}

export function scaledUpgradeCost(
  base: number,
  rate: number,
  n: number,
  prestige: number,
): number {
  return Math.floor(upgradeCost(base, rate, n) * prestigeEconomyCostMultiplier(prestige));
}

export function ingredientUnlockCost(unlockCount: number): number {
  return upgradeCost(150, 1.14, unlockCount);
}

export function tableCost(tableCount: number): number {
  return upgradeCost(200, 1.12, tableCount);
}

export function equipmentCost(purchasedCount: number): number {
  return upgradeCost(500, 1.18, purchasedCount);
}

export function gridExpansionCost(expansionCount: number): number {
  return upgradeCost(300, 1.15, expansionCount);
}

/** One-time kitchen annex unlock (base before prestige scaling). */
export function kitchenAnnexBaseCost(): number {
  return 800;
}

export function bulkUpgradeCost(
  base: number,
  rate: number,
  startLevel: number,
  count: number,
): number {
  if (count <= 0) return 0;
  return Math.floor(
    base * Math.pow(rate, startLevel) * (Math.pow(rate, count) - 1) / (rate - 1),
  );
}
