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
 * Precaches the built shell + hashed assets + /data/*.json after first load.
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

      // Runtime precache: cache-first for same-origin GETs after install.
      // Version bump via build timestamp so updates replace the SW.
      const version = Date.now().toString(36);
      const sw = `/* pwa-lite ${version} */
const CACHE = 'rs-shell-${version}';
const PRECACHE = [
  '${base}',
  '${base}index.html',
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok && (url.pathname.startsWith('${base}') || url.pathname.includes('/data/'))) {
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        if (req.mode === 'navigate') {
          const shell = await cache.match('${base}index.html');
          if (shell) return shell;
        }
        throw err;
      }
    }),
  );
});
`;
      writeFileSync(path.join(absOut, 'sw.js'), sw);
    },
  };
}
