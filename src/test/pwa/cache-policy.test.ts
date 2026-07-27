import { describe, expect, it } from 'vitest';
import {
  buildServiceWorkerRegisterScript,
  buildServiceWorkerSource,
  cacheStrategyForPath,
} from '../../../scripts/pwa-cache-policy.ts';

describe('pwa cache policy', () => {
  it('uses network-first for app shell and unhashed atlases', () => {
    expect(cacheStrategyForPath('/index.html')).toBe('network-first');
    expect(cacheStrategyForPath('/assets/index-abcdef12.js')).toBe('network-first');
    expect(cacheStrategyForPath('/assets/atlases/characters.json')).toBe('network-first');
    expect(cacheStrategyForPath('/assets/atlases/characters.png')).toBe('network-first');
    expect(cacheStrategyForPath('/assets/audio/click.ogg')).toBe('network-first');
    expect(cacheStrategyForPath('/data/ingredients.json')).toBe('network-first');
  });

  it('soft-reloads when a waiting worker replaces an existing controller', () => {
    const script = buildServiceWorkerRegisterScript('/');
    expect(script).toContain("navigator.serviceWorker.register('/sw.js')");
    expect(script).toContain('controllerchange');
    expect(script).toContain('location.reload');
    expect(script).toContain('hadController');
  });

  it('generates a service worker that network-fetches atlases and never touches IndexedDB', () => {
    const sw = buildServiceWorkerSource({ version: 'testver', base: '/' });
    expect(sw).toContain('network-first');
    expect(sw).toContain('/assets/atlases/');
    expect(sw).toContain('SKIP_WAITING');
    expect(sw).not.toMatch(/indexedDB|idb-keyval|localStorage/i);
    // Must not prefer a cached atlas over the network (stale frames after deploy).
    expect(sw).not.toMatch(/cache\.match\(req\);\s*\n\s*if \(cached\) return cached;\s*\n\s*const res = await fetch/);
  });
});
