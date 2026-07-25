/**
 * Fail CI if any shipped asset under public/assets lacks a CC0 CREDITS.json entry.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'public', 'assets');
const CREDITS_PATH = path.join(ASSETS, 'CREDITS.json');

interface CreditsManifest {
  policy: string;
  entries: Array<{ path: string; license: string }>;
  shippedFiles?: string[];
}

function walkFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) {
      out.push(...walkFiles(full, rel));
    } else if (name !== 'CREDITS.json') {
      out.push(rel);
    }
  }
  return out;
}

function normalizeEntryPath(entryPath: string): string[] {
  if (entryPath.includes('#')) {
    const [file] = entryPath.split('#');
    return [file];
  }
  return [entryPath];
}

function main(): void {
  if (!statSync(CREDITS_PATH).isFile()) {
    console.error('FAIL: public/assets/CREDITS.json missing. Run npm run build:assets.');
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(CREDITS_PATH, 'utf8')) as CreditsManifest;
  if (manifest.policy !== 'CC0-only') {
    console.error(`FAIL: CREDITS policy must be CC0-only, got "${manifest.policy}"`);
    process.exit(1);
  }

  const covered = new Set<string>();
  for (const entry of manifest.entries) {
    if (entry.license !== 'CC0') {
      console.error(`FAIL: Non-CC0 license on entry ${entry.path}`);
      process.exit(1);
    }
    for (const p of normalizeEntryPath(entry.path)) covered.add(p);
  }

  const shipped = walkFiles(ASSETS);
  const missing: string[] = [];
  for (const file of shipped) {
    if (!covered.has(file)) missing.push(file);
  }

  if (missing.length > 0) {
    console.error('FAIL: Shipped assets without CREDITS.json entry:');
    for (const file of missing) console.error(`  - ${file}`);
    process.exit(1);
  }

  console.log(`PASS: ${shipped.length} shipped asset files covered by ${manifest.entries.length} CC0 CREDITS entries.`);
}

main();
