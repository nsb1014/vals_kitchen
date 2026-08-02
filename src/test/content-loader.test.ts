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

function filenameFromRequest(input: string): string {
  return input.split('/').pop() ?? '';
}

function jsonResponse(payload: unknown): Response {
  return Response.json(payload);
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function standardResponse(input: string): Response {
  const filename = filenameFromRequest(input);
  const payload = payloadByFile[filename];
  if (!payload) {
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }
  return jsonResponse(payload);
}

describe('runtime content loading', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('loads boot content and defers scoring/recipes until requested', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        return standardResponse(input);
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

  it.each(['SERVE_DISH', 'FLOOR_DELIVER'])(
    'loads scoring and recipes before %s is ready',
    async (actionType) => {
      vi.stubGlobal('fetch', vi.fn(async (input: string) => standardResponse(input)));

      const loader = await import('../app/content-loader.ts');
      await loader.loadBootContent();

      await loader.ensureContentForAction(actionType);

      expect(loader.isScoringContentReady()).toBe(true);
      expect(loader.isRecipesContentReady()).toBe(true);
      expect(Object.keys(loader.getDomainContext().compoundAffinity).length).toBeGreaterThan(0);
      expect(loader.getDomainContext().recipes.length).toBeGreaterThan(0);
    },
  );

  it.each(['SERVE_DISH', 'FLOOR_DELIVER'])(
    'keeps %s pending until scoring and recipes finish in order',
    async (actionType) => {
      const scoringResponse = deferred<Response>();
      const recipesResponse = deferred<Response>();
      const requests: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn((input: string) => {
          const filename = filenameFromRequest(input);
          requests.push(filename);
          if (filename === 'compound-affinity.json') return scoringResponse.promise;
          if (filename === 'recipes.json') return recipesResponse.promise;
          return Promise.resolve(standardResponse(input));
        }),
      );

      const loader = await import('../app/content-loader.ts');
      await loader.loadBootContent();
      let settled = false;

      const actionLoad = loader.ensureContentForAction(actionType) as Promise<void>;
      void actionLoad.then(() => {
        settled = true;
      });

      expect(requests.filter((name) => name === 'compound-affinity.json')).toHaveLength(1);
      expect(requests).not.toContain('recipes.json');
      expect(settled).toBe(false);

      scoringResponse.resolve(jsonResponse(compoundAffinity));
      await vi.waitFor(() => {
        expect(requests.filter((name) => name === 'recipes.json')).toHaveLength(1);
      });
      expect(settled).toBe(false);

      recipesResponse.resolve(jsonResponse(recipes));
      await actionLoad;

      expect(settled).toBe(true);
      expect(loader.isScoringContentReady()).toBe(true);
      expect(loader.isRecipesContentReady()).toBe(true);
    },
  );

  it('retries a failed recipe request without partially replacing the context', async () => {
    let recipeRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (filenameFromRequest(input) === 'recipes.json') {
          recipeRequests += 1;
          if (recipeRequests === 1) {
            return new Response(null, {
              status: 503,
              statusText: 'Temporarily Unavailable',
            });
          }
        }
        return standardResponse(input);
      }),
    );

    const loader = await import('../app/content-loader.ts');
    const context = await loader.loadBootContent();

    await expect(loader.ensureContentForAction('FLOOR_DELIVER')).rejects.toThrow(
      'Failed to load content asset recipes.json: 503 Temporarily Unavailable',
    );

    expect(loader.getDomainContext()).toBe(context);
    expect(loader.isScoringContentReady()).toBe(true);
    expect(loader.isRecipesContentReady()).toBe(false);
    expect(context.recipes).toEqual([]);

    await loader.ensureContentForAction('FLOOR_DELIVER');

    expect(recipeRequests).toBe(2);
    expect(loader.getDomainContext()).toBe(context);
    expect(loader.isRecipesContentReady()).toBe(true);
    expect(context.recipes).toEqual(recipes);
  });

  it('retries a failed scoring request without replacing partial scoring data', async () => {
    let scoringRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (filenameFromRequest(input) === 'compound-affinity.json') {
          scoringRequests += 1;
          if (scoringRequests === 1) {
            return new Response(null, { status: 503, statusText: 'Try Again' });
          }
        }
        return standardResponse(input);
      }),
    );

    const loader = await import('../app/content-loader.ts');
    const context = await loader.loadBootContent();

    await expect(loader.ensureContentForAction('SERVE_DISH')).rejects.toThrow(
      'Failed to load content asset compound-affinity.json: 503 Try Again',
    );
    expect(loader.getDomainContext()).toBe(context);
    expect(loader.isScoringContentReady()).toBe(false);
    expect(loader.isRecipesContentReady()).toBe(false);
    expect(context.compoundAffinity).toEqual({});
    expect(context.recipes).toEqual([]);

    await loader.ensureContentForAction('SERVE_DISH');

    expect(scoringRequests).toBe(2);
    expect(loader.isScoringContentReady()).toBe(true);
    expect(loader.isRecipesContentReady()).toBe(true);
  });

  it('contains preload failures and lets an explicit interaction retry', async () => {
    let recipeRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (filenameFromRequest(input) === 'recipes.json') {
          recipeRequests += 1;
          if (recipeRequests === 1) {
            return new Response(null, {
              status: 503,
              statusText: 'Warmup Failed',
            });
          }
        }
        return standardResponse(input);
      }),
    );

    const loader = await import('../app/content-loader.ts');
    await loader.loadBootContent();
    const unhandledReasons: unknown[] = [];
    const recordUnhandled = (reason: unknown) => unhandledReasons.push(reason);
    process.on('unhandledRejection', recordUnhandled);

    try {
      loader.preloadDeferredContent();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandledReasons).toEqual([]);
      expect(loader.isScoringContentReady()).toBe(true);
      expect(loader.isRecipesContentReady()).toBe(false);

      await loader.ensureContentForAction('FLOOR_DELIVER');

      expect(recipeRequests).toBe(2);
      expect(loader.isRecipesContentReady()).toBe(true);
    } finally {
      process.off('unhandledRejection', recordUnhandled);
    }
  });

  it.each(['FLOOR_MOVE', 'FLOOR_TAKE_ORDER', 'SET_COMPOSE_DRAFT', 'CLOSE_DAY'])(
    'keeps unrelated %s actions nonblocking',
    async (actionType) => {
      const fetchMock = vi.fn(async (input: string) => standardResponse(input));
      vi.stubGlobal('fetch', fetchMock);
      const loader = await import('../app/content-loader.ts');
      await loader.loadBootContent();
      const bootRequestCount = fetchMock.mock.calls.length;

      expect(loader.ensureContentForAction(actionType)).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(bootRequestCount);
      expect(loader.isScoringContentReady()).toBe(false);
      expect(loader.isRecipesContentReady()).toBe(false);
    },
  );
});
