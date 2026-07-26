import type { Archetype, Ingredient } from '../types.ts';
import {
  computeFlavorEnvelope,
  computeUnlockedFlavorProfile,
  generateCustomerRequest,
  pickDayArchetypes,
  signatureActionableAxes,
} from './customer-request-generator.ts';
import type { DailyModifier } from './modifiers.ts';
import { pickModifier } from './modifiers.ts';
import type { Customer, DayGenInput, GeneratedDay } from './types.ts';
import { customersPerDay } from './types.ts';
import { createRng, daySeed, type Rng } from '../rng/index.ts';

function preferenceSignature(customer: Customer): string {
  return Object.entries(customer.preference.primary)
    .map(([axis, band]) => `${axis}:${band}`)
    .sort()
    .join(',');
}

/** Axis set without bands — catches hearty/umami mirror swaps. */
function preferenceAxisSet(customer: Customer): string {
  return Object.keys(customer.preference.primary).sort().join(',');
}

export function generateDay(
  input: DayGenInput,
  ctx: {
    archetypes: Archetype[];
    ingredientsById: Map<string, Ingredient>;
    modifiers: DailyModifier[];
    compoundAffinity: Record<string, Record<string, number>>;
  },
  rng?: Rng,
): GeneratedDay {
  const seed = daySeed(input.globalRunSeed, input.day, input.prestige);
  const dayRng = rng ?? createRng(seed);
  const count = customersPerDay(input);
  const modifier = pickModifier(input.day, ctx.modifiers, seed);

  const unlocked = input.unlockedIngredientIds
    .map((id) => ctx.ingredientsById.get(id))
    .filter((item): item is Ingredient => Boolean(item));
  const envelope = computeFlavorEnvelope(input.unlockedIngredientIds, ctx.ingredientsById);
  const profile = computeUnlockedFlavorProfile(unlocked, envelope);
  const dayArchetypes = pickDayArchetypes(ctx.archetypes, profile, envelope, count, dayRng);

  const customers: Customer[] = [];
  const usedSignatures = new Set<string>();
  const usedAxisSets = new Set<string>();

  for (let i = 0; i < count; i++) {
    const customerRng = dayRng.fork(i + 1);
    const archetype = dayArchetypes[i]!;
    const signatureAxes = signatureActionableAxes(archetype, profile);

    let best: Customer | null = null;
    let bestScore = -1;

    for (let attempt = 0; attempt < 8; attempt++) {
      const attemptRng = customerRng.fork(attempt + 1);
      const request = generateCustomerRequest(
        archetype,
        input.unlockedIngredientIds,
        ctx.ingredientsById,
        attemptRng,
        ctx.compoundAffinity,
      );
      const customer: Customer = {
        id: `customer_${input.day}_${i}`,
        archetypeId: archetype.id,
        preference: request.preference,
      };
      const fullSig = preferenceSignature(customer);
      const axisSet = preferenceAxisSet(customer);
      let score = 0;
      if (!usedSignatures.has(fullSig)) score += 4;
      if (!usedAxisSets.has(axisSet)) score += 3;
      const top = signatureAxes[0];
      if (top && customer.preference.primary[top] === 'high') score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = customer;
      }
      if (score >= 7) break;
    }

    const chosen = best!;
    customers.push(chosen);
    usedSignatures.add(preferenceSignature(chosen));
    usedAxisSets.add(preferenceAxisSet(chosen));
  }

  return { seed, modifier, customers };
}

export function serializeDayForComparison(day: GeneratedDay): string {
  return JSON.stringify({
    seed: day.seed,
    modifierId: day.modifier.id,
    customers: day.customers.map((customer) => ({
      archetypeId: customer.archetypeId,
      preference: customer.preference,
    })),
  });
}
