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
  const packRows = manifest.packs
    .map((pack) => {
      const source =
        pack.sourceUrl.startsWith('http://') || pack.sourceUrl.startsWith('https://')
          ? `<a href="${pack.sourceUrl}" rel="noopener noreferrer">${pack.sourceUrl}</a>`
          : `<span>${pack.sourceUrl}</span>`;
      return `<li><strong>${pack.pack}</strong> — ${pack.author}; ${source} (${pack.license})${pack.note ? ` — ${pack.note}` : ''}</li>`;
    })
    .join('');

  const grouped = new Map<string, CreditEntry[]>();
  for (const entry of manifest.entries) {
    const list = grouped.get(entry.pack) ?? [];
    list.push(entry);
    grouped.set(entry.pack, list);
  }

  const detailSections = [...grouped.entries()]
    .map(([pack, entries]) => {
      const uses = [...new Set(entries.flatMap((e) => e.usedIn))].sort().join(', ');
      return `<p class="settings-note"><strong>${pack}</strong> — used in: ${uses}</p>`;
    })
    .join('');

  return `
    <p class="settings-note">All shipped art and audio is <strong>CC0 (public domain)</strong>. Attribution is optional but listed for auditability.</p>
    <ul class="credits-list">${packRows}</ul>
    ${detailSections}
    <p class="settings-note credits-meta">Manifest v${manifest.version} · ${manifest.entries.length} tracked assets · generated ${manifest.generatedAt.slice(0, 10)}</p>
  `;
}

export function clearCreditsCache(): void {
  cached = null;
}
