import { describe, expect, it } from 'vitest';
import {
  generateCustomerRequest,
  pantryFitArchetypes,
  computeFlavorEnvelope,
  computeUnlockedFlavorProfile,
} from '../../domain/day/customer-request-generator.ts';
import { aggregateDish } from '../../domain/flavor/aggregate.ts';
import { AXIS_LABELS } from '../../domain/flavor/axis-labels.ts';
import { createRng } from '../../domain/rng/index.ts';
import { NEW_GAME_STARTER_IDS } from '../../domain/types.ts';
import { resolveIdealFlavorProfile } from '../../ui/presentation/ideal-flavor.ts';
import {
  buildFlavorBarsViewModel,
  renderFlavorBarsHtml,
} from '../../ui/presentation/flavor-profile.ts';
import { testBundle, testContext } from '../test-helpers.ts';

describe('ideal flavor profile on customer requests', () => {
  const unlockedIds = [...NEW_GAME_STARTER_IDS];

  it('stores a witness-achievable idealProfile with Flavors-tab phrase labels', () => {
    const unlocked = unlockedIds.map((id) => testContext.ingredientsById.get(id)!);
    const envelope = computeFlavorEnvelope(unlockedIds, testContext.ingredientsById);
    const profile = computeUnlockedFlavorProfile(unlocked, envelope);
    const fit = pantryFitArchetypes(testBundle.archetypes, profile, envelope);
    const rng = createRng(42_001);

    for (let i = 0; i < 12; i++) {
      const archetype = fit[rng.nextInt(0, fit.length - 1)]!;
      const request = generateCustomerRequest(
        archetype,
        unlockedIds,
        testContext.ingredientsById,
        rng,
        testContext.compoundAffinity,
      );

      expect(request.preference.idealProfile).toBeDefined();
      expect(request.witnessIngredientIds.length).toBeGreaterThanOrEqual(3);
      expect(request.witnessIngredientIds.every((id) => (unlockedIds as string[]).includes(id))).toBe(true);

      const witnessDish = aggregateDish(
        request.witnessIngredientIds.map((id) => testContext.ingredientsById.get(id)!.flavor),
      );
      expect(request.preference.idealProfile).toEqual(witnessDish);

      for (const phrase of request.preference.phrases) {
        const usesAxisLabel = Object.values(AXIS_LABELS).some((label) =>
          phrase.includes(label),
        );
        expect(usesAxisLabel, `phrase "${phrase}" should use an axis label`).toBe(true);
        expect(phrase.toLowerCase()).not.toMatch(/savory|garlicky|spicy kick|tangy|indulgent/);
      }
    }
  });

  it('renders ideal bars with numeric values and cooking bars without', () => {
    const preference = generateCustomerRequest(
      testBundle.archetypes.find((a) => a.id === 'garlic_fan')!,
      unlockedIds,
      testContext.ingredientsById,
      createRng(99),
      testContext.compoundAffinity,
    ).preference;
    const ideal = resolveIdealFlavorProfile(preference);
    const withValues = renderFlavorBarsHtml(buildFlavorBarsViewModel(ideal), {
      showValues: true,
    });
    const withoutValues = renderFlavorBarsHtml(buildFlavorBarsViewModel(ideal), {
      showValues: false,
    });
    expect(withValues).toContain('flavor-bar-value');
    expect(withValues).toMatch(/\d\.\d/);
    expect(withoutValues).not.toContain('flavor-bar-value');
    expect(withoutValues).toContain('no-value');
    expect(withoutValues).toContain('Umami');
    expect(withoutValues).toContain('Pungent');
  });
});
