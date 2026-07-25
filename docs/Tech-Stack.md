# Tech Stack

**Status:** Phase 0–7 implemented; immersive floor redesign approved (budgets below updated for floor sim)  
**Gameplay formulas:** Owned by [PRD.md](./PRD.md) — this document does not restate economy or scoring numbers.  
**Research basis:** [RESEARCH.md](./RESEARCH.md) §7–§9  
**Floor design:** [superpowers/specs/2026-07-25-immersive-floor-service-design.md](./superpowers/specs/2026-07-25-immersive-floor-service-design.md)

---

## Table of Contents

1. [Stack Overview](#1-stack-overview)
2. [Technology Choices & Rejected Alternatives](#2-technology-choices--rejected-alternatives)
3. [Bundle Size Budget](#3-bundle-size-budget)
4. [iPhone 17 Target Specifications](#4-iphone-17-target-specifications)
5. [Mobile Safari UX Requirements](#5-mobile-safari-ux-requirements)
6. [Persistence Architecture](#6-persistence-architecture)
7. [Hosting & Deploy Pipeline](#7-hosting--deploy-pipeline)
8. [Dev Tooling](#8-dev-tooling)
9. [Cross-References](#9-cross-references)

---

## 1. Stack Overview

```
┌──────────────────────────────────────────────────────┐
│  Vite 8 + TypeScript 5.9                             │
│  ├── PixiJS 8.19 (tree-shaken) — restaurant grid/canvas │
│  ├── DOM/HTML overlay — menus, dialogs, save UI    │
│  ├── CSS Modules — layout shell, safe areas          │
│  ├── Zustand 5.0.14 — client game state              │
│  ├── idb-keyval 6.3.0 — IndexedDB persistence       │
│  └── lz-string 1.5.0 — Save Code compression         │
├──────────────────────────────────────────────────────┤
│  vite-plugin-pwa — Workbox offline shell             │
│  Deploy: Cloudflare Workers Static Assets (primary)  │
│  Backup: GitHub Pages                                │
│  Target canvas: 390×844 CSS px logical               │
│  Tiles: 16×16 art @ 2× = 32px logical; ¾ Y-sort render │
│  Camera: follow player + clamp (not fit-only)        │
└──────────────────────────────────────────────────────┘
```

| Layer | Installed version | Role |
|-------|-------------------|------|
| Build | **Vite 8.1.5** | Fast HMR, tree-shaking, PWA plugin |
| Language | **TypeScript 5.9.3** (strict) | Type-safe domain + UI. TS 7 is intentionally **not** pinned — blocked by `@typescript-eslint` peer requirements at time of install; 5.9+ is deliberate, not an oversight |
| Renderer | **PixiJS 8.19.0** | Top-down pixel grid, sprites, DnD hit tests |
| UI overlay | Plain DOM + CSS Modules | Menus, inspector, shop, settings — not React |
| State | **Zustand 5.0.14** | Lightweight store; selectors for UI |
| Save I/O | **idb-keyval 6.3.0** | Thin IndexedDB wrapper (~2 KB) |
| Compression | **lz-string 1.5.0** | Save Code compression (`compressToUint8Array` + base64url) |
| PWA | vite-plugin-pwa 1.3.0 | Offline shell, manifest, service worker |
| Tests | **Vitest 4.1.10** | Domain + persistence unit tests |

**No backend server.** Static assets only. See [Backend-Guidelines.md](./Backend-Guidelines.md).

---

## 2. Technology Choices & Rejected Alternatives

### Vite + TypeScript

**Chosen:** Vite 8 with `strict: true` TypeScript 5.9.3.

**Rejected:** Webpack (slower DX), plain JS (no schema safety for 100+ ingredient vectors), TypeScript 7 (peer-dep blocked with current ESLint toolchain).

**Why:** Standard for modern static SPAs; excellent tree-shaking for PixiJS imports.

### PixiJS 8 (not Phaser, not pure DOM, not Canvas2D raw)

**Chosen:** PixiJS 8.19.0 with tree-shaken imports: `Application`, `Container`, `Sprite`, `Texture`, `Graphics`, `FederatedPointerEvent`.

**Rejected:**

| Alternative | Why Rejected |
|-------------|--------------|
| Phaser 3 (~274 KB gzip) | Physics, arcade, scene manager unused; 2× bundle for turn-based game |
| Pure DOM/CSS Grid | Pixel art scaling blurs without canvas; unified aesthetic harder |
| Raw Canvas2D | Manual sprite batching and hit tests; PixiJS solves this |

**Why PixiJS:** Tree-shaken canvas for a ticker-driven ¾ world (pathfinding consumers, Y-sort, sprites); crisp pixel scaling; pointer events for tap-to-move and layout DnD. Phaser rejected — unused physics/scene weight.

### DOM Overlay (not React)

**Chosen:** Vanilla DOM + CSS Modules for all non-canvas UI.

**Rejected:** React (~40+ KB + runtime overhead), Vue, Svelte — unnecessary for menu-heavy but structurally simple UI.

**Why:** RESEARCH definitive stack specifies DOM/HTML overlay. Zustand subscribes DOM components directly. Keeps bundle near 190 KB gzip target.

### Zustand

**Chosen:** Zustand 5.0.14 for game state bridge between domain core and UI/canvas.

**Rejected:** Redux (boilerplate), Jotai (less common for game loops), React Context (no React).

**Why:** Minimal API; works outside React; good selector pattern for mobile perf.

### idb-keyval (not localStorage, not Dexie alone)

**Chosen:** idb-keyval 6.3.0 for primary save blob.

**Rejected:** localStorage (5 MB cap, sync API, same eviction), raw localStorage-only architecture.

**Why:** Async, structured, larger quota; RESEARCH §7 recommendation. Dexie optional if indexed queries needed later — v1 single-key blob sufficient.

### LZ-String

**Chosen:** lz-string 1.5.0 — `compressToUint8Array` / `decompressFromUint8Array` wrapped in base64url for Save Code (API changed from older `compressToUTF8`).

**Rejected:** Uncompressed base64 (too long for user copy/paste), pako/gzip ( heavier dependency for small saves).

---

## 3. Bundle Size Budget

Budgets are stated in **decimal bytes** (1 KB = 1,000 bytes), matching `gzip -c` output from the production build.

| Component | Target (gzip bytes) | Notes |
|-----------|---------------------|-------|
| PixiJS 8 (tree-shaken) | ≤ 130,000 | Import only used modules |
| Application code (initial JS) | ≤ 120,000 | Floor sim + UI + store + boot (raised for immersive floor) |
| lz-string | ~3,000 | Save Code only |
| idb-keyval | ~2,000 | |
| **Total initial JS** | **≤ 280,000 bytes** | Hard budget pending post-slice measure; CI warning at 260,000; re-measure and tighten after vertical slice |
| Boot content data (`/data/*.json` except recipes + affinity) | ≤ 7,000 | Fetched at boot; ingredients, equipment, archetypes, modifiers |
| Deferred content data (recipes + compound-affinity) | ≤ 34,000 | Fetched after boot, before first serve / day open |
| Asset atlases (lazy) | ≤ 4,000,000 total | ¾ tiles, chairs, character variants; loaded post-boot |
| Audio (lazy) | ≤ 5,000,000 total | Loaded on first interaction |

**Load target:** < 2 s first interactive on 4G (iPhone 17). Game content JSON is **not** bundled into initial JS; it is served from `/data/` and injected into `DomainContext` at the app boundary. Recipes and compound-affinity load lazily after first paint but before first use.

**Strategies:**

- Runtime fetch of `/data/*.json` instead of static JSON imports in the entry graph
- Dynamic `import()` for PixiJS app bootstrap after splash DOM
- Texture atlases per scene (restaurant, UI icons)
- No source maps in production build
- `vite build --report` size check in CI

---

## 4. iPhone 17 Target Specifications

Primary QA device: **iPhone 17 Safari (WebKit)**.

| Spec | Value | Design Implication |
|------|-------|-------------------|
| Screen | 6.3" OLED | Large tap targets still mandatory |
| Physical resolution | 2622 × 1206 px @ 460 ppi | 3× device pixel ratio |
| Logical CSS | ~393 × 852 pt | Design to **390 × 844 CSS px** |
| Refresh | 120 Hz ProMotion | Target 60fps game loop; no unnecessary 120fps work |
| Safe areas | Dynamic Island (top), home indicator (bottom) | `env(safe-area-inset-*)` |
| Browser | Safari WebKit | IndexedDB eviction rules apply |

### Viewport & Layout Shell

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

```css
.game-shell {
  height: 100svh; /* stable viewport; avoid raw 100vh */
  width: 100%;
  padding:
    env(safe-area-inset-top)
    env(safe-area-inset-right)
    env(safe-area-inset-bottom)
    env(safe-area-inset-left);
  overscroll-behavior: none;
  position: fixed;
  inset: 0;
}
```

Use `100dvh` as progressive enhancement where supported; **`100svh` is the baseline** per RESEARCH.

### Device Pixel Ratio & Tile Scaling

- Source art: **16×16 px** tiles/sprites (characters may use multi-frame sheets).
- **Integer scale factor 2** → 32 CSS px per logical tile.
- Starter map is a **full room** (larger than legacy 4×4); camera **follows the player** and clamps to map bounds — do not require the entire grid to fit 390 px width.
- PixiJS `resolution: devicePixelRatio` with `autoDensity: true`; prefer integer scales (1, 2, 3) for pixel crispness.
- CSS: `canvas { image-rendering: pixelated; }`
- Render **¾** layers with Y-sort; logical walk grid remains orthographic.

### Touch Targets

- Minimum **44 × 44 CSS px** for all interactive DOM controls (WCAG 2.5.8).
- PixiJS grid tiles may be 32 px visually but **hit areas expanded** to 44 px via invisible Graphics padding or DOM overlay buttons.

### Prevent Double-Tap Zoom & Rubber-Band

```css
.game-surface {
  touch-action: manipulation; /* removes 300ms delay + double-tap zoom */
}
```

- Do **not** use `user-scalable=no` (accessibility).
- `overscroll-behavior: none` on body and game shell.
- `position: fixed` game container prevents rubber-band scroll.

### Pointer Input

Use **Pointer Events** (PixiJS federated events + DOM `pointerdown`) — not legacy `touchstart`/`mouseDown` split.

---

## 5. Mobile Safari UX Requirements

| Requirement | Implementation |
|-------------|----------------|
| Viewport fit | `viewport-fit=cover` |
| Stable height | `100svh` game shell |
| Safe areas | CSS env insets on shell and fixed headers |
| Touch targets | 44px minimum (DOM); expanded hit areas (canvas) |
| No zoom on tap | `touch-action: manipulation` |
| No rubber-band | `overscroll-behavior: none`; fixed positioning |
| Pixel crisp | Integer tile scale + `image-rendering: pixelated` |
| Offline | Service worker caches app shell + atlases |
| Add to Home Screen | Prompt after ~3 service days on iOS |

---

## 6. Persistence Architecture

See [Backend-Guidelines.md](./Backend-Guidelines.md) for save schema, migrations, and repository pattern. This section covers platform behavior and user-facing mitigations.

### Storage Stack

```
SaveManager
├── Primary: IndexedDB key "restaurant-save" via idb-keyval
├── Boot: navigator.storage.persist()
├── Auto-save: after each service day summary
├── Export: lz-string Uint8Array → base64url Save Code (RS1.*)
└── Import: validate prefix, decompress, migrate, checksum
```

### iOS 7-Day Eviction Reality

| Condition | Behavior |
|-----------|----------|
| No Safari interaction with origin for 7 days | **All script-writable storage deleted** (IndexedDB, localStorage, SW cache) |
| Private Browsing | Ephemeral — cleared on close |
| Add to Home Screen (PWA) | Origin exempt from 7-day ITP cap |
| `navigator.storage.persist()` granted | Exempt from proactive eviction (WebKit 2024+) |

**Mitigation strategy:**

1. Call `persist()` on first boot; log grant/deny.
2. Prompt Add to Home Screen after ~3 days (iOS).
3. Settings Save Code export/import (user-owned backup).
4. Auto-save after every day — minimize loss window within active play.

Save Code format (owned by PRD user-facing spec):

```
RS1.<base64url(lz-string.compressToUint8Array(JSON envelope))>
```

### Save Schema Versioning

```typescript
interface SaveEnvelope {
  saveVersion: 1;
  checksum: string;       // FNV-1a hex over canonical JSON
  createdAt: string;      // ISO 8601
  gameState: GameState;   // see Backend-Guidelines
}
```

**Migration strategy:**

- `saveVersion` integer in envelope.
- `migrateSave(raw: unknown): SaveEnvelope` chain: v0→v1→…
- Unknown future version → block import with user message; never silently corrupt.
- Migrations are pure functions tested in isolation.

### Corruption Recovery

- On load failure: offer "Start New Game" or "Import Save Code".
- Keep last-known-good snapshot key `restaurant-save-backup` written before each overwrite.

---

## 7. Hosting & Deploy Pipeline

**Setup guide:** [Deployment.md](./Deployment.md) — step-by-step Cloudflare Workers Static Assets + GitHub Pages instructions.

### Primary: Cloudflare Workers Static Assets

`wrangler.toml` makes Cloudflare classify this project as a **Worker**. Publish the static SPA from `./dist` via `[assets]` — no Worker `main` script. Do **not** ship a Pages-style `public/_redirects` catch-all (`/* /index.html 200`); Workers treats that as an infinite redirect (error 100324). SPA fallback is `not_found_handling = "single-page-application"` in `wrangler.toml`.

| Feature | Detail |
|---------|--------|
| Bandwidth | Unlimited (free tier) |
| Builds | 500/month; 20k files; 25 MiB/file |
| HTTPS | Automatic |
| Git deploy | GitHub integration → `npx wrangler deploy` after build |
| Headers | `public/_headers` → copied to `dist/_headers` (honored by Workers Static Assets) |
| SPA routing | `wrangler.toml` `[assets] not_found_handling = "single-page-application"` (no `_redirects`) |
| PWA | Service worker + `manifest.webmanifest`; Workbox precaches `/data/*.json` |
| Worker name | `vals-kitchen` (`wrangler.toml` `name`) |

**Why primary:** No commercial ToS restriction; unlimited bandwidth; PR previews.

**Dashboard build settings:**

| Setting | Value |
|---------|-------|
| Build command | `npm run sync:data && npm run build` |
| Deploy command | leave blank (defaults to `npx wrangler deploy`) or set explicitly |
| Assets directory | `./dist` (from `wrangler.toml` `[assets] directory`) |
| Node version | `20` (`NODE_VERSION` env var) |
| Secrets | None required |

### Backup: GitHub Pages

- Fallback mirror from same `dist/` artifact via `.github/workflows/deploy-github-pages.yml` (manual `workflow_dispatch`).
- Project pages URL: `https://USER.github.io/REPO/` — build with `npm run build -- --base /REPO/`.
- Content loader resolves `/data/` via `import.meta.env.BASE_URL` (Vite transform in `vite.config.ts`).
- ~100 GB soft bandwidth limit sufficient for low-traffic backup.

### Optional: itch.io

- Discovery mirror only; upload HTML5 zip — not primary host.

### Cache headers (`public/_headers`)

Hashed assets are immutable; shell, service worker, and content JSON must stay fresh so players are not stranded on stale builds (critical for a save-game PWA).

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache, must-revalidate

/sw.js
  Cache-Control: no-cache, must-revalidate

/registerSW.js
  Cache-Control: no-cache, must-revalidate

/workbox-*.js
  Cache-Control: no-cache, must-revalidate

/data/*
  Content-Type: application/json; charset=utf-8
  Cache-Control: public, max-age=0, must-revalidate

/manifest.webmanifest
  Cache-Control: public, max-age=86400, must-revalidate
```

| Path | Rationale |
|------|-----------|
| `/assets/*` | Content-hashed filenames — long cache safe |
| `/index.html` | Must reference latest hashed bundles after deploy |
| `/sw.js`, `/registerSW.js`, `/workbox-*.js` | Stale SW serves old app code; can desync from IndexedDB saves |
| `/data/*.json` | Paths not hashed; `must-revalidate` picks up content rebuilds; SW precache enables offline |

### Build / Deploy Pipeline

```yaml
# .github/workflows/ci.yml — every push/PR to main
- npm ci
- npm run sync:data
- npm run validate:content
- npm run typecheck
- npm run lint
- npm run test              # fast suite only (*.sim.test.ts excluded)
- npm run build
- npm run size:check        # fail if initial JS gzip > Tech-Stack hard cap (280k until post-slice measure)

# .github/workflows/sim-tests.yml — workflow_dispatch + nightly schedule only
- npm run test:sim

# Cloudflare Workers Static Assets — Git-connected deploy (`wrangler deploy`) on push to main
# GitHub Pages backup — manual workflow with --base /REPO/
```

**Environment:** No secrets required for static deploy. No API keys in client bundle.

**Runtime content:** `scripts/build-content.ts` writes `src/data/`; `npm run sync:data` copies to `public/data/` before build so `dist/data/*.json` is served at `/data/*.json`.

---

## 8. Dev Tooling

| Tool | Installed | Purpose |
|------|-----------|---------|
| `tsc --noEmit` | TS 5.9.3 | Strict typecheck |
| ESLint + `@typescript-eslint` 8.65 | | Lint |
| Prettier 3.9.6 | | Format (config in repo) |
| Vitest 4.1.10 | | Fast unit suite (`npm run test`); deep balance sim via `npm run test:sim` |
| Playwright (optional) | | Smoke E2E on mobile viewport emulation |
| `scripts/check-bundle-size.ts` | | Gzip gate on initial app JS (`npm run size:check`) |

**Scripts:**

```json
{
  "dev": "vite",
  "build": "npm run sync:data && tsc && vite build",
  "sync:data": "mkdir -p public/data && cp src/data/*.json public/data/",
  "build:content": "tsx scripts/build-content.ts",
  "typecheck": "tsc --noEmit",
  "lint": "eslint src scripts",
  "test": "vitest run",
  "test:sim": "vitest run --config vitest.sim.config.ts",
  "validate:content": "tsx scripts/validate-content-cli.ts",
  "size:check": "tsx scripts/check-bundle-size.ts",
  "preview": "vite preview"
}
```

**CI (`/.github/workflows/`):**

| Workflow | Trigger | Gates |
|----------|---------|-------|
| `ci.yml` | Push/PR to `main` | `sync:data`, `validate:content`, `typecheck`, `lint`, `test` (fast), `build`, `size:check` (gzip cap per Tech-Stack §3) |
| `sim-tests.yml` | `workflow_dispatch` + nightly `0 6 * * *` | `sync:data`, `validate:content`, `test:sim` only — **not** on ordinary pushes |
| `deploy-github-pages.yml` | Manual only | GitHub Pages backup build with configurable `--base` |

Every push/PR runs the fast test suite (target well under one minute). Run `npm run test:sim` manually or via the nightly/manual workflow for multi-cycle prestige balance cross-checks (~2.5 min).

**Node version:** 20 LTS (`.github/workflows/*` and Cloudflare `NODE_VERSION=20`).

---

## 9. Cross-References

| Topic | Document |
|-------|----------|
| Gameplay rules & formulas | [PRD.md](./PRD.md) |
| PixiJS/DOM architecture | [Frontend-Guidelines.md](./Frontend-Guidelines.md) |
| Save schema, domain core | [Backend-Guidelines.md](./Backend-Guidelines.md) |
| Build phases | [Plan.md](./Plan.md) |
| Risks (iOS eviction, bundle size) | [Error-Tracker.md](./Error-Tracker.md) |
