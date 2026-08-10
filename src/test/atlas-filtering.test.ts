import { describe, expect, it } from 'vitest';
import { restaurantAtlasScaleMode } from '../assets/loader.ts';

describe('restaurant atlas filtering', () => {
  it('smoothly downsamples illustrated actors and furniture', () => {
    expect(restaurantAtlasScaleMode('characters')).toBe('linear');
    expect(restaurantAtlasScaleMode('furniture')).toBe('linear');
  });

  it('keeps edge-to-edge room tiles and food icons seam-safe / crisp', () => {
    expect(restaurantAtlasScaleMode('tiles')).toBe('nearest');
    expect(restaurantAtlasScaleMode('food')).toBe('nearest');
  });
});
