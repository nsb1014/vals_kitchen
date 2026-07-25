export interface Rng {
  next(): number;
  nextInt(min: number, max: number): number;
  fork(salt: number): Rng;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const nextState = (): number => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };

  const rng: Rng = {
    next(): number {
      return nextState() / 4294967296;
    },
    nextInt(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    fork(salt: number): Rng {
      return createRng(nextState() ^ (salt >>> 0));
    },
  };

  return rng;
}

export function hashSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const part of parts) {
    h ^= part >>> 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function daySeed(globalRunSeed: number, day: number, prestige: number): number {
  return hashSeed(globalRunSeed, day, prestige);
}
