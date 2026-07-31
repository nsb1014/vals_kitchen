import { CREDITS_URL } from './manifest.ts';

export interface CreditEntry {
  path: string;
  pack: string;
  author: string;
  sourceUrl: string;
  license: 'CC0';
  usedIn: string[];
  sourceFile?: string;
  approximationNote?: string;
}

export interface CreditsManifest {
  version: number;
  generatedBy: string;
  generatedAt: string;
  policy: string;
  vendorNote?: string;
  packs: Array<{
    pack: string;
    author: string;
    sourceUrl: string;
    license: 'CC0';
    note?: string;
  }>;
  entries: CreditEntry[];
  shippedFiles: string[];
}

let cached: CreditsManifest | null = null;

export async function loadCreditsManifest(): Promise<CreditsManifest> {
  if (cached) return cached;
  const res = await fetch(CREDITS_URL);
  if (!res.ok) throw new Error(`Failed to load credits manifest (${res.status})`);
  cached = (await res.json()) as CreditsManifest;
  return cached;
}

export function renderCreditsHtml(manifest: CreditsManifest): string {
  const externalPacks = manifest.packs.filter(
    (pack) =>
      pack.author !== 'Val\'s Kitchen project' &&
      pack.author !== 'Restaurant Simulator project',
  );
  const packRows = externalPacks
    .map((pack) => {
      const source =
        pack.sourceUrl.startsWith('http://') || pack.sourceUrl.startsWith('https://')
          ? `<a href="${pack.sourceUrl}" rel="noopener noreferrer">${pack.sourceUrl}</a>`
          : `<span>${pack.sourceUrl}</span>`;
      return `<li><strong>${pack.pack}</strong> — ${pack.author}; ${source} (${pack.license})${pack.note ? ` — ${pack.note}` : ''}</li>`;
    })
    .join('');

  return `
    <p class="settings-note">Original game art, character poses, ingredient icons, and achievement badges are AI-assisted or project-generated and dedicated to <strong>CC0</strong>.</p>
    <p class="settings-note">External music, sound effects, and source packs:</p>
    <ul class="credits-list">${packRows}</ul>
    <p class="settings-note credits-meta">Full asset provenance remains recorded in manifest v${manifest.version}.</p>
  `;
}

export function clearCreditsCache(): void {
  cached = null;
}
