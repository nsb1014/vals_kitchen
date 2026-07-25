/**
 * Bundle size gate for CI and local verification.
 *
 * Measures gzip bytes of initial app JS reachable from dist/index.html
 * (including dynamic-import deps registered via Vite's __vite__mapDeps).
 * Does NOT count runtime-fetched /data/*.json as JS; reports JSON separately.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(DIST, 'assets');
const DATA = path.join(DIST, 'data');

/** Hard cap from docs/Tech-Stack.md §3 (decimal bytes, gzip -c equivalent). */
const JS_HARD_CAP = 280_000;
/** CI warning threshold from docs/Tech-Stack.md §3. */
const JS_WARN_THRESHOLD = 260_000;

const BOOT_JSON = ['ingredients.json', 'equipment.json', 'archetypes.json', 'modifiers.json'];
const DEFERRED_JSON = ['recipes.json', 'compound-affinity.json'];

function gzipBytes(filePath: string): number {
  return gzipSync(readFileSync(filePath)).length;
}

function depsFromChunk(code: string): string[] {
  const deps = new Set<string>();
  for (const match of code.matchAll(/(?:from|import\()["'](\.\/[^"']+\.js)["']/g)) {
    deps.add(path.basename(match[1]!));
  }
  for (const match of code.matchAll(/__vite__mapDeps[^[]*\[([^\]]+)\]/g)) {
    for (const pathMatch of match[1]!.matchAll(/["']([^"']+\.js)["']/g)) {
      deps.add(path.basename(pathMatch[1]!));
    }
  }
  return [...deps];
}

function seedsFromIndexHtml(html: string): string[] {
  const seeds = new Set<string>();
  for (const match of html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)) {
    seeds.add(match[1]!);
  }
  return [...seeds];
}

function walkInitialJsGraph(): { files: string[]; gzipTotal: number; perFile: Map<string, number> } {
  const indexHtml = readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const visited = new Set<string>();
  const queue = seedsFromIndexHtml(indexHtml);
  const perFile = new Map<string, number>();

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    const filePath = path.join(ASSETS, file);
    if (!existsSync(filePath)) {
      console.warn(`Warning: referenced chunk missing on disk: ${file}`);
      continue;
    }

    const gz = gzipBytes(filePath);
    perFile.set(file, gz);

    for (const dep of depsFromChunk(readFileSync(filePath, 'utf8'))) {
      if (!visited.has(dep)) queue.push(dep);
    }
  }

  let gzipTotal = 0;
  for (const gz of perFile.values()) gzipTotal += gz;

  return { files: [...visited].sort(), gzipTotal, perFile };
}

function sumJsonGzip(files: string[]): { raw: number; gzip: number } {
  let raw = 0;
  let gzip = 0;
  for (const file of files) {
    const filePath = path.join(DATA, file);
    if (!existsSync(filePath)) {
      console.warn(`Warning: missing content file: ${file}`);
      continue;
    }
    const buf = readFileSync(filePath);
    raw += buf.length;
    gzip += gzipSync(buf).length;
  }
  return { raw, gzip };
}

function main(): void {
  if (!existsSync(DIST)) {
    console.error('dist/ not found. Run `npm run build` first.');
    process.exit(1);
  }
  if (!existsSync(ASSETS)) {
    console.error('dist/assets/ not found. Run `npm run build` first.');
    process.exit(1);
  }

  const { files, gzipTotal, perFile } = walkInitialJsGraph();

  console.log('=== Initial app JS (gzip, decimal bytes) ===');
  for (const file of files) {
    console.log(`  ${file}: ${perFile.get(file)?.toLocaleString('en-US')}`);
  }
  console.log(`  TOTAL: ${gzipTotal.toLocaleString('en-US')} bytes`);
  console.log(`  Budget: ${JS_HARD_CAP.toLocaleString('en-US')} bytes (hard cap)`);

  if (gzipTotal >= JS_WARN_THRESHOLD && gzipTotal <= JS_HARD_CAP) {
    console.warn(
      `Warning: initial JS gzip (${gzipTotal.toLocaleString('en-US')}) is at or above ${JS_WARN_THRESHOLD.toLocaleString('en-US')} bytes.`,
    );
  }

  const boot = sumJsonGzip(BOOT_JSON);
  const deferred = sumJsonGzip(DEFERRED_JSON);
  const allData = sumJsonGzip(readdirSync(DATA).filter((f) => f.endsWith('.json')));

  console.log('');
  console.log('=== Runtime content JSON (not counted as initial JS) ===');
  console.log(
    `  Boot (${BOOT_JSON.join(', ')}): ${boot.raw.toLocaleString('en-US')} raw / ${boot.gzip.toLocaleString('en-US')} gzip bytes`,
  );
  console.log(
    `  Deferred (${DEFERRED_JSON.join(', ')}): ${deferred.raw.toLocaleString('en-US')} raw / ${deferred.gzip.toLocaleString('en-US')} gzip bytes`,
  );
  console.log(
    `  All /data/*.json: ${allData.raw.toLocaleString('en-US')} raw / ${allData.gzip.toLocaleString('en-US')} gzip bytes`,
  );

  if (gzipTotal > JS_HARD_CAP) {
    console.error('');
    console.error(
      `FAIL: initial app JS gzip ${gzipTotal.toLocaleString('en-US')} exceeds hard cap ${JS_HARD_CAP.toLocaleString('en-US')} bytes.`,
    );
    process.exit(1);
  }

  console.log('');
  console.log(`PASS: initial app JS gzip ${gzipTotal.toLocaleString('en-US')} <= ${JS_HARD_CAP.toLocaleString('en-US')} bytes.`);
}

main();
