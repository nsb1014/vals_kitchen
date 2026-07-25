import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import { pwaLite } from './scripts/vite-pwa-lite.ts';

/** Resolve /data fetches under GitHub Pages project subpaths without editing src on disk. */
function contentLoaderBaseUrl(): Plugin {
  const DATA_BASE_PATTERN = /const DATA_BASE = '\/data';/;
  const DATA_BASE_REPLACEMENT =
    "const DATA_BASE = `${import.meta.env.BASE_URL}data`.replace(/\\/\\/+/, '/');";

  return {
    name: 'content-loader-base-url',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.replace(/\\/g, '/');
      if (!normalizedId.includes('content-loader')) return;
      if (!DATA_BASE_PATTERN.test(code)) return;
      return {
        code: code.replace(DATA_BASE_PATTERN, DATA_BASE_REPLACEMENT),
        map: null,
      };
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [contentLoaderBaseUrl(), pwaLite()],
});
