import { describe, expect, it } from 'vitest';
import {
  computeFlavorEnvelope,
  computeUnlockedFlavorProfile,
  generateCustomerRequest,
  pantryFitArchetypes,
  pickDayArchetypes,
  signatureActionableAxes,
  findBestMatchCombo,
} from '../domain/day/customer-request-generator.ts';
import { generateDay } from '../domain/day/generate.ts';
import { createRng } from '../domain/rng/index.ts';
import { NEW_GAME_STARTER_IDS } from '../domain/types.ts';
import { computeMatchStars } from '../domain/flavor/scoring.ts';
import { aggregateDish } from '../domain/flavor/aggregate.ts';
import { testBundle, testContext } from './test-helpers.ts';

describe('day-1 taste diversity + honest archetype names', () => {
  const unlockedIds = [...NEW_GAME_STARTER_IDS];

  function day1Profile() {
    const unlocked = unlockedIds.map((id) => testContext.ingredientsById.get(id)!);
    const envelope = computeFlavorEnvelope(unlockedIds, testContext.ingredientsById);
    const profile = computeUnlockedFlavorProfile(unlocked, envelope);
    return { unlocked, envelope, profile };
  }

  it('only offers pantry-fit archetypes whose signature craving is achievable', () => {
    const { envelope, profile } = day1Profile();
    const fit = pantryFitArchetypes(testBundle.archetypes, profile, envelope);

    expect(fit.length).toBeGreaterThanOrEqual(3);
    for (const archetype of fit) {
      const top = signatureActionableAxes(archetype, profile)[0]!;
      expect(profile.actionableAxes.includes(top)).toBe(true);
      const max = envelope.maxByAxis[top] ?? 0;
      const weight = archetype.primaryAxisWeights[top] ?? 0;
      if (weight >= 3) expect(max).toBeGreaterThan(6);
      else expect(max).toBeGreaterThan(3);
    }
    // Names whose top craving isn't achievable stay off day 1.
    expect(fit.some((a) => a.id === 'heat_lover')).toBe(false);
    expect(fit.some((a) => a.id === 'tang_master')).toBe(false);
    expect(fit.some((a) => a.id === 'earthy_explorer')).toBe(false);
    expect(fit.some((a) => a.id === 'adventurous_eater')).toBe(false);
    expect(fit.some((a) => a.id === 'light_eater')).toBe(false); // LI max too low on starters
    // Garlic / umami / rich should — those axes peak high in starters.
    expect(fit.some((a) => a.id === 'garlic_fan')).toBe(true);
    expect(fit.some((a) => a.id === 'umami_hunter' || a.id === 'comfort_seeker')).toBe(true);
    expect(fit.some((a) => a.id === 'rich_indulger')).toBe(true);
  });

  it('generates preferences that honor the named craving (high, not absence)', () => {
    const { envelope, profile } = day1Profile();
    const fit = pantryFitArchetypes(testBundle.archetypes, profile, envelope);
    const rng = createRng(7_701);

    let hits = 0;
    for (let i = 0; i < 40; i++) {
      const archetype = fit[rng.nextInt(0, fit.length - 1)]!;
      const request = generateCustomerRequest(
        archetype,
        unlockedIds,
        testContext.ingredientsById,
        rng,
        testContext.compoundAffinity,
      );
      const top = signatureActionableAxes(archetype, profile)[0]!;
      const band = request.preference.primary[top];
      const weight = archetype.primaryAxisWeights[top] ?? 0;
      if (band && band !== 'low' && (weight < 3 || band === 'high')) {
        hits += 1;
      }
    }
    expect(hits / 40).toBeGreaterThanOrEqual(0.9);
  });

  it('makes matching a named preference beat ignoring it on day-1 pantry', () => {
    const { envelope, profile } = day1Profile();
    const garlic = pantryFitArchetypes(testBundle.archetypes, profile, envelope).find(
      (a) => a.id === 'garlic_fan',
    )!;
    const rng = createRng(12_345);
    const request = generateCustomerRequest(
      garlic,
      unlockedIds,
      testContext.ingredientsById,
      rng,
      testContext.compoundAffinity,
    );
    expect(request.preference.primary.PU).toBe('high');

    const best = findBestMatchCombo(
      unlockedIds,
      request.preference,
      testContext.ingredientsById,
      testContext.compoundAffinity,
    );
    const bland = day1Profile()
      .unlocked.filter((item) => item.id !== 'onion' && item.id !== 'garlic')
      .slice(0, 3);
    const blandDish = aggregateDish(bland.map((item) => item.flavor));
    const blandScore = computeMatchStars(
      blandDish,
      request.preference,
      bland.map((item) => item.id),
      testContext.compoundAffinity,
    );
    expect(best.score).toBeGreaterThan(blandScore + 0.5);
  });

  it('samples distinct archetypes and meaningfully different prefs on day 1', () => {
    const day = generateDay(
      {
        globalRunSeed: 99,
        day: 1,
        prestige: 0,
        rating: 3,
        seatingCapacity: 4,
        unlockedIngredientIds: unlockedIds,
      },
      {
        archetypes: testBundle.archetypes,
        ingredientsById: testContext.ingredientsById,
        modifiers: testContext.modifiers,
        compoundAffinity: testContext.compoundAffinity,
      },
    );

    const { profile } = day1Profile();
    const archetypeIds = new Set(day.customers.map((c) => c.archetypeId));
    const signatures = new Set(
      day.customers.map((c) =>
        Object.entries(c.preference.primary)
          .map(([axis, band]) => `${axis}:${band}`)
          .sort()
          .join(','),
      ),
    );
    const axisSets = new Set(
      day.customers.map((c) => Object.keys(c.preference.primary).sort().join(',')),
    );
    const topAxes = new Set(
      day.customers.map((c) => {
        const arch = testBundle.archetypes.find((a) => a.id === c.archetypeId)!;
        return signatureActionableAxes(arch, profile)[0]!;
      }),
    );

    expect(day.customers.length).toBe(4);
    expect(archetypeIds.size).toBe(4);
    // Not the screenshot bug: three identical hearty/umami mirrors.
    expect(signatures.size).toBeGreaterThanOrEqual(3);
    expect(axisSets.size).toBeGreaterThanOrEqual(3);
    expect(topAxes.size).toBeGreaterThanOrEqual(3);

    for (const customer of day.customers) {
      const archetype = testBundle.archetypes.find((a) => a.id === customer.archetypeId)!;
      const top = signatureActionableAxes(archetype, profile)[0]!;
      const band = customer.preference.primary[top];
      expect(band).toBeTruthy();
      expect(band).not.toBe('low');
      if ((archetype.primaryAxisWeights[top] ?? 0) >= 3) {
        expect(band).toBe('high');
      }
      // Screenshot names must not appear until their pantry craving unlocks.
      expect([
        'tang_master',
        'earthy_explorer',
        'adventurous_eater',
        'light_eater',
      ]).not.toContain(customer.archetypeId);
    }
  });

  it('pickDayArchetypes diversifies top craving axes before repeating', () => {
    const { envelope, profile } = day1Profile();
    const picked = pickDayArchetypes(testBundle.archetypes, profile, envelope, 4, createRng(42));
    expect(new Set(picked.map((a) => a.id)).size).toBe(4);
    const tops = picked.map((a) => signatureActionableAxes(a, profile)[0]!);
    expect(new Set(tops).size).toBeGreaterThanOrEqual(3);
  });
});
