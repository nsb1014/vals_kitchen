import type { Archetype, Ingredient } from '../types.ts';
import { generateCustomerRequest } from './customer-request-generator.ts';
import type { DailyModifier } from './modifiers.ts';
import { pickModifier } from './modifiers.ts';
import type { Customer, DayGenInput, GeneratedDay } from './types.ts';
import { customersPerDay } from './types.ts';
import { createRng, daySeed, type Rng } from '../rng/index.ts';

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

  const customers: Customer[] = [];
  for (let i = 0; i < count; i++) {
    const customerRng = dayRng.fork(i + 1);
    const archetype = ctx.archetypes[customerRng.nextInt(0, ctx.archetypes.length - 1)]!;
    const request = generateCustomerRequest(
      archetype,
      input.unlockedIngredientIds,
      ctx.ingredientsById,
      customerRng,
      ctx.compoundAffinity,
    );
    customers.push({
      id: `customer_${input.day}_${i}`,
      archetypeId: archetype.id,
      preference: request.preference,
    });
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
