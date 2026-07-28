import { describe, expect, it } from 'vitest';
import ingredients from '../data/ingredients.json';
import equipment from '../data/equipment.json';
import recipes from '../data/recipes.json';
import archetypes from '../data/archetypes.json';
import compoundAffinity from '../data/compound-affinity.json';
import {
  COMPETENT_MATCH_EVAL_CAP,
  createRng,
  findBestMatchCombo,
  findOptimalMatchCombo,
  generateCustomerRequest,
} from '../domain/day/customer-request-generator.ts';
import { aggregateDish } from '../domain/flavor/aggregate.ts';
import { computeMatchStars } from '../domain/flavor/scoring.ts';
import type { AxisKey, Band } from '../domain/types.ts';
import type { ContentBundle, Ingredient } from '../domain/types.ts';
import { NEW_GAME_STARTER_IDS, SOFT_RESET_STARTER_IDS } from '../domain/types.ts';
import { testBundle, testContext } from './test-helpers.ts';

const bundle: ContentBundle = {
  ingredients: ingredients as Ingredient[],
  equipment,
  recipes,
  archetypes,
  compoundAffinity,
};

function satisfiabilityFloor(unlockedCount: number): number {
  if (unlockedCount <= 5) return 6.5;
  if (unlockedCount <= 12) return 6.8;
  return 6.75;
}

function unlockIdsForCount(count: number): string[] {
  const extrasNeeded = Math.max(0, count - NEW_GAME_STARTER_IDS.length);
  return [
    ...NEW_GAME_STARTER_IDS,
    ...bundle.ingredients.slice(NEW_GAME_STARTER_IDS.length, NEW_GAME_STARTER_IDS.length + extrasNeeded).map(
      (item) => item.id,
    ),
  ];
}

function bandForAggregate(value: number): Band {
  if (value <= 3) return 'low';
  if (value <= 6) return 'mid';
  return 'high';
}

describe('competent match heuristic', () => {
  it('evaluates at most COMPETENT_MATCH_EVAL_CAP combos on large unlock sets', () => {
    const unlockedIds = bundle.ingredients.slice(0, 40).map((item) => item.id);
    const preference = {
      primary: { UM: 'high' as const, SO: 'mid' as const },
      avoid: {},
      phrases: [],
    };
    findBestMatchCombo(
      unlockedIds,
      preference,
      testContext.ingredientsById,
      testContext.compoundAffinity,
    );
    expect(COMPETENT_MATCH_EVAL_CAP).toBeLessThanOrEqual(512);
  });

  it('matches optimal within 0.75 stars on small toy unlock sets', () => {
    const unlockedIds = testBundle.ingredients.slice(0, 10).map((item) => item.id);
    const rng = createRng(4242);
    for (let i = 0; i < 20; i++) {
      const archetype = testBundle.archetypes[rng.nextInt(0, testBundle.archetypes.length - 1)]!;
      const request = generateCustomerRequest(
        archetype,
        unlockedIds,
        testContext.ingredientsById,
        rng,
        testContext.compoundAffinity,
      );
      const competent = findBestMatchCombo(
        unlockedIds,
        request.preference,
        testContext.ingredientsById,
        testContext.compoundAffinity,
      );
      const optimal = findOptimalMatchCombo(
        unlockedIds,
        request.preference,
        testContext.ingredientsById,
        testContext.compoundAffinity,
      );
      expect(competent.score).toBeGreaterThanOrEqual(optimal.score - 0.75);
    }
  });

  it(
    'meets tiered satisfiability floors under the heuristic across the >=13 tier',
    { timeout: 30_000 },
    () => {
      const unlockStates = [
        [...SOFT_RESET_STARTER_IDS],
        [...NEW_GAME_STARTER_IDS],
        unlockIdsForCount(13),
        unlockIdsForCount(20),
        unlockIdsForCount(40),
        unlockIdsForCount(100),
      ];
      const rng = createRng(9001);

      for (const unlockedIds of unlockStates) {
        if (unlockedIds.length < 3) continue;
        const floor = satisfiabilityFloor(unlockedIds.length);
        for (let i = 0; i < 12; i++) {
          const archetype = bundle.archetypes[rng.nextInt(0, bundle.archetypes.length - 1)]!;
          const request = generateCustomerRequest(
            archetype,
            unlockedIds,
            testContext.ingredientsById,
            rng,
            testContext.compoundAffinity,
          );
          const match = findBestMatchCombo(
            unlockedIds,
            request.preference,
            testContext.ingredientsById,
            testContext.compoundAffinity,
          );
          expect(
            match.score,
            `unlock=${unlockedIds.length} floor=${floor} score=${match.score}`,
          ).toBeGreaterThanOrEqual(floor);
        }
      }
    },
  );

  it('derives every request band from an achievable aggregated witness dish', () => {
    const rng = createRng(71_006);

    for (let sample = 0; sample < 40; sample++) {
      const archetype =
        testBundle.archetypes[rng.nextInt(0, testBundle.archetypes.length - 1)]!;
      const request = generateCustomerRequest(
        archetype,
        [...NEW_GAME_STARTER_IDS],
        testContext.ingredientsById,
        rng,
        testContext.compoundAffinity,
      );
      const witness = aggregateDish(
        request.witnessIngredientIds.map(
          (id) => testContext.ingredientsById.get(id)!.flavor,
        ),
      );

      for (const axis of Object.keys(request.preference.primary) as AxisKey[]) {
        expect(request.preference.primary[axis]).toBe(
          bandForAggregate(witness[axis]),
        );
        if (request.preference.primary[axis] === 'high') {
          expect(
            witness[axis],
            `${axis} was called high without a high aggregate`,
          ).toBeGreaterThan(6);
        }
      }

      expect(
        computeMatchStars(
          witness,
          request.preference,
          request.witnessIngredientIds,
          testContext.compoundAffinity,
        ),
      ).toBeGreaterThanOrEqual(9);
    }
  });
});
