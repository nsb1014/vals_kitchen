import type { Plugin } from 'vite';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildServiceWorkerRegisterScript,
  buildServiceWorkerSource,
} from './pwa-cache-policy.ts';

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
 * Network-first for HTML/JS/CSS/SW/atlases/audio/data so deploys reach clients
 * without clearing site data. Player saves live in IndexedDB (not Cache Storage).
 * Soft-reloads when a new SW takes control of an already-controlled page.
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
${buildServiceWorkerRegisterScript(base)}
</script>`;
      return html
        .replace('</head>', `${headBits}</head>`)
        .replace('</body>', `${register}</body>`);
    },
    closeBundle() {
      const absOut = path.resolve(outDir);
      writeFileSync(path.join(absOut, 'manifest.webmanifest'), `${JSON.stringify(MANIFEST, null, 2)}\n`);

      const version = Date.now().toString(36);
      writeFileSync(
        path.join(absOut, 'sw.js'),
        buildServiceWorkerSource({ version, base }),
      );
    },
  };
}
