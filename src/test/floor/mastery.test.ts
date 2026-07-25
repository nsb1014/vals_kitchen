import { describe, expect, it } from 'vitest';
import {
  applyMasteryServe,
  masteryBonusStars,
  servesToReachNext,
} from '../../domain/floor/mastery.ts';

describe('recipe mastery', () => {
  it('unlocks level 1 on first matched serve', () => {
    const r = applyMasteryServe({}, 'recipe_a');
    expect(r.level).toBe(1);
    expect(r.leveledUp).toBe(true);
    expect(r.mastery.recipe_a).toEqual({ level: 1, progress: 0 });
  });

  it('needs 2 serves after L1 to reach L2', () => {
    let m = applyMasteryServe({}, 'r').mastery;
    expect(servesToReachNext(1)).toBe(2);
    m = applyMasteryServe(m, 'r').mastery;
    expect(m.r!.level).toBe(1);
    expect(m.r!.progress).toBe(1);
    const r2 = applyMasteryServe(m, 'r');
    expect(r2.level).toBe(2);
    expect(r2.leveledUp).toBe(true);
  });

  it('bonus stars scale by level × 0.05', () => {
    expect(masteryBonusStars(1)).toBeCloseTo(0.05);
    expect(masteryBonusStars(10)).toBeCloseTo(0.5);
    expect(masteryBonusStars(0)).toBe(0);
  });
});
