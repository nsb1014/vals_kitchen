import type { FloorDay } from '../floor/types.ts';
import type { CustomerPreference } from '../types.ts';
import type { DailyModifier } from './modifiers.ts';

export interface Customer {
  id: string;
  archetypeId: string;
  preference: CustomerPreference;
}

export interface ActiveDay {
  seed: number;
  modifierId: string;
  customers: Customer[];
  queueIndex: number;
  dayEarnings: number;
  dayMatchSum: number;
  customersServed: number;
  floor?: FloorDay | null;
}

export interface GeneratedDay {
  seed: number;
  modifier: DailyModifier;
  customers: Customer[];
}

export interface DayGenInput {
  globalRunSeed: number;
  day: number;
  prestige: number;
  rating: number;
  seatingCapacity: number;
  unlockedIngredientIds: string[];
}

export function customersPerDay(input: {
  seatingCapacity: number;
  rating: number;
  prestige: number;
  day: number;
}): number {
  const raw = Math.floor(
    3 + input.rating * 0.8 + input.prestige * 0.5 + Math.pow(input.day, 0.2),
  );
  return Math.min(input.seatingCapacity, raw);
}
