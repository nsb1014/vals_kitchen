import type { Plugin } from 'vite';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const MANIFEST = {
  name: 'Restaurant Simulator',
  short_name: 'RestaurantSim',
  theme_color: '#1a1a2e',
  background_color: '#1a1a2e',
  display: 'standalone',
  start_url: '.',
  scope: '.',
} as const;

/**
 * Minimal installable PWA without workbox / vite-plugin-pwa.
 *
 * HTML / JS / CSS / SW: network-first so deploys reach clients.
 * Hashed atlases + /data: cache-first (immutable or content-addressed).
 */
export function pwaLite(): Plugin {
  let outDir = 'dist';
  let base = '/';

  return {
    name: 'pwa-lite',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
      base = config.base.endsWith('/') ? config.base : `${config.base}/`;
    },
    transformIndexHtml(html) {
      const headBits = `<link rel="manifest" href="${base}manifest.webmanifest" />`;
      const register = `<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('${base}sw.js').catch(() => {});
  });
}
</script>`;
      return html
        .replace('</head>', `${headBits}</head>`)
        .replace('</body>', `${register}</body>`);
    },
    closeBundle() {
      const absOut = path.resolve(outDir);
      writeFileSync(path.join(absOut, 'manifest.webmanifest'), `${JSON.stringify(MANIFEST, null, 2)}\n`);

      const version = Date.now().toString(36);
      const sw = `/* pwa-lite ${version} */
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

function isImmutableAsset(pathname) {
  return (
    pathname.includes('/assets/atlases/') ||
    pathname.includes('/assets/audio/') ||
    pathname.includes('/data/') ||
    /\\/assets\\/[\\w.-]+\\.[a-f0-9]{8}\\.\\w+$/i.test(pathname)
  );
}

function isShellRequest(req, pathname) {
  return (
    req.mode === 'navigate' ||
    pathname === '${base}' ||
    pathname === '${base}index.html' ||
    pathname === '${base}sw.js' ||
    pathname.endsWith('.html') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.webmanifest')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const pathname = url.pathname;

  if (isShellRequest(req, pathname) && !pathname.includes('/assets/atlases/')) {
    event.respondWith(
      fetch(req)
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
        }),
    );
    return;
  }

  if (isImmutableAsset(pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  }
});
`;
      writeFileSync(path.join(absOut, 'sw.js'), sw);
    },
  };
}
