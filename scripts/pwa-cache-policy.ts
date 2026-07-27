/**
 * PWA update / cache policy shared by the Vite plugin and unit tests.
 *
 * Saves live in IndexedDB (idb-keyval) — never in Cache Storage. SW cache
 * rotation must not touch player progress.
 *
 * Unhashed runtime assets (atlases, audio, /data) and the app shell use
 * network-first so deploys reach players without a manual cache clear.
 */

export type CacheStrategy = 'network-first';

/** Every SW-managed GET uses network-first with Cache API as offline fallback. */
export function cacheStrategyForPath(_pathname: string): CacheStrategy {
  return 'network-first';
}

export function buildServiceWorkerRegisterScript(base: string): string {
  const swUrl = `${base}sw.js`;
  return `if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      // Soft reload picks up the new shell/atlases; IndexedDB saves stay intact.
      location.reload();
    });
    navigator.serviceWorker.register('${swUrl}').then((reg) => {
      if (!reg) return;
      const nudge = (worker) => {
        if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
      };
      if (reg.waiting) nudge(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            nudge(installing);
          }
        });
      });
      // Catch deploys while the tab stays open.
      setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
}`;
}

export function buildServiceWorkerSource(opts: { version: string; base: string }): string {
  const { version, base } = opts;
  return `/* pwa-lite ${version} — network-first shell+atlases; Cache API offline only (never game saves) */
const CACHE = 'rs-shell-${version}';
const PRECACHE = [
  '${base}manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function shouldHandle(pathname) {
  return (
    pathname === '${base}' ||
    pathname === '${base}index.html' ||
    pathname === '${base}sw.js' ||
    pathname.endsWith('.html') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.webmanifest') ||
    pathname.includes('/assets/atlases/') ||
    pathname.includes('/assets/audio/') ||
    pathname.includes('/data/') ||
    /\\/assets\\/[\\w.-]+\\.[a-f0-9]{8}\\.\\w+$/i.test(pathname)
  );
}

/** network-first: try live deploy, fall back to Cache API offline only. */
function networkFirst(req, pathname) {
  return fetch(req)
    .then((res) => {
      if (res.ok && pathname !== '${base}sw.js') {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    })
    .catch(async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await caches.match('${base}index.html');
        if (shell) return shell;
      }
      throw new Error('offline');
    });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const pathname = url.pathname;
  if (req.mode === 'navigate' || shouldHandle(pathname)) {
    event.respondWith(networkFirst(req, pathname));
  }
});
`;
}
