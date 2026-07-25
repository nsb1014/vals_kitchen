import { afterEach, describe, expect, it, vi } from 'vitest';
import ingredients from '../data/ingredients.json';
import equipment from '../data/equipment.json';
import recipes from '../data/recipes.json';
import archetypes from '../data/archetypes.json';
import compoundAffinity from '../data/compound-affinity.json';
import modifiers from '../data/modifiers.json';

const payloadByFile: Record<string, unknown> = {
  'ingredients.json': ingredients,
  'equipment.json': equipment,
  'archetypes.json': archetypes,
  'modifiers.json': modifiers,
  'compound-affinity.json': compoundAffinity,
  'recipes.json': recipes,
};

describe('runtime content loading', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('loads boot content and defers scoring/recipes until requested', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const filename = input.split('/').pop() ?? '';
        const payload = payloadByFile[filename];
        if (!payload) {
          return new Response(null, { status: 404, statusText: 'Not Found' });
        }
        return Response.json(payload);
      }),
    );

    const loader = await import('../app/content-loader.ts');
    await loader.loadBootContent();
    const ctx = loader.getDomainContext();
    expect(ctx.ingredients.length).toBeGreaterThan(0);
    expect(ctx.archetypes.length).toBeGreaterThan(0);
    expect(ctx.recipes).toEqual([]);
    expect(ctx.compoundAffinity).toEqual({});
    expect(loader.isScoringContentReady()).toBe(false);
    expect(loader.isRecipesContentReady()).toBe(false);

    loader.preloadDeferredContent();
    await loader.ensureScoringContentLoaded();
    await loader.ensureRecipesLoaded();

    expect(loader.isScoringContentReady()).toBe(true);
    expect(loader.isRecipesContentReady()).toBe(true);
    expect(Object.keys(loader.getDomainContext().compoundAffinity).length).toBeGreaterThan(0);
    expect(loader.getDomainContext().recipes.length).toBeGreaterThan(0);
  });
});
