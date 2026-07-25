# Deployment Guide

Step-by-step instructions to publish **Restaurant Simulator** to the web. The game is a static PWA (no server, no login). Primary host: **Cloudflare Workers Static Assets** (Workers & Pages dashboard; `wrangler.toml` classifies the project as a Worker). Backup: **GitHub Pages**.

**Prerequisites:** GitHub account, Node.js 20 LTS, npm, Python 3.12+ with Pillow (`pip install -r requirements.txt`), and this repo on your machine.

---

## Table of Contents

1. [Before you deploy](#1-before-you-deploy)
2. [Create the GitHub repo and push](#2-create-the-github-repo-and-push)
3. [Deploy to Cloudflare (primary)](#3-deploy-to-cloudflare-primary)
4. [Verify the first deploy](#4-verify-the-first-deploy)
5. [Test on a real iPhone](#5-test-on-a-real-iphone)
6. [Custom domain (optional)](#6-custom-domain-optional)
7. [GitHub Pages fallback](#7-github-pages-fallback)
8. [Rollback a bad deploy](#8-rollback-a-bad-deploy)
9. [Troubleshooting](#9-troubleshooting)
10. [Free-tier limits](#10-free-tier-limits)

---

## 1. Before you deploy

Confirm the project builds locally:

```bash
cd "/path/to/Restaurant Simulator"
npm install
pip install -r requirements.txt
npm run sync:data
npm run validate:content
npm run typecheck
npm run lint
npm run test
npm run build
npm run size:check
```

Production output lands in `dist/`. It must contain at least:

- `index.html`
- `assets/` (hashed JS/CSS)
- `data/*.json` (runtime game content)
- `sw.js`, `manifest.webmanifest`

If `npm` is not on your PATH (some sandboxed or minimal shells), use one of these:

```bash
# Option A: install Node LTS from https://nodejs.org (includes npm)
# Option B: use a full login shell where npm is installed
# Option C: invoke the local toolchain directly (from repo root):
node node_modules/typescript/bin/tsc
node node_modules/vite/bin/vite.js build
node node_modules/tsx/dist/cli.mjs scripts/check-bundle-size.ts
```

---

## 2. Create the GitHub repo and push

This repo starts with git on `main`, no commits, and no remote. Do this once:

### 2.1 Create an empty repo on GitHub

1. Go to [https://github.com/new](https://github.com/new)
2. Repository name: e.g. `restaurant-simulator`
3. **Do not** initialize with README, .gitignore, or license (this project already has them)
4. Click **Create repository**

### 2.2 First commit and push

Replace `YOUR_USER` and `YOUR_REPO` with your GitHub username and repo name:

```bash
cd "/path/to/Restaurant Simulator"

git add .
git commit -m "Initial commit: Restaurant Simulator scaffold"
git branch -M main
git remote add origin git@github.com:YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Use HTTPS if you prefer:

```bash
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
```

After push, open the repo on GitHub and confirm files are visible. CI (`.github/workflows/ci.yml`) runs automatically on `main` and on pull requests.

---

## 3. Deploy to Cloudflare (primary)

Cloudflare builds from your GitHub repo and serves `dist/` on a global CDN with free HTTPS.

Because this repo includes `wrangler.toml`, Cloudflare may classify the project as a **Worker** (not classic Pages) and run `npx wrangler deploy` after the build. That path is correct once `wrangler.toml` defines an `[assets]` directory — no Worker `main` script is required for a static SPA.

### 3.1 Sign up and connect GitHub

1. Go to [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) (free plan is fine)
2. In the left sidebar: **Workers & Pages** → **Create** → **Connect to Git**
3. Authorize Cloudflare to access GitHub
4. Select your repository (e.g. `vals_kitchen`)

### 3.2 Build settings — Workers + Static Assets (this repo)

On the **Set up builds and deployments** screen:

| Setting | Value |
|---------|-------|
| **Production branch** | `main` |
| **Framework preset** | None |
| **Build command** | `npm run build` |
| **Deploy command** | *(leave blank — Cloudflare defaults to `npx wrangler deploy`)* |
| **Non-production branch deploy command** | `npx wrangler versions upload` *(optional; uncheck non-production builds until `main` works)* |
| **Root directory** | *(leave blank)* |

`npm run build` already runs `sync:data` before `vite build`, so a separate sync step in the dashboard is not required.

You may set **Deploy command** explicitly to `npx wrangler deploy`; an empty field is equivalent. Both require `[assets]` in `wrangler.toml`.

The assets directory is **`./dist`**, declared in `wrangler.toml` under `[assets]`. You do not need a separate dashboard “Build output directory” when Cloudflare treats this as a Worker — Wrangler reads `directory = "./dist"` at deploy time. If the dashboard still shows **Build output directory**, set it to `dist` for consistency; it must match `wrangler.toml`.

Click **Environment variables** → **Add variable**:

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_VERSION` | `20` | Matches CI and `docs/Tech-Stack.md` |

No API keys or secrets are required for this static game.

Click **Save and Deploy**.

#### Classic Cloudflare Pages (without Workers deploy)

If your project is classified as **Pages** (no Deploy command, automatic publish after build):

| Setting | Value |
|---------|-------|
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Deploy command** | *(leave blank)* |

Optional manual CLI upload from your machine: `npx wrangler pages deploy dist` (not `wrangler deploy`).

### 3.3 What Cloudflare picks up from the repo

These files are copied into `dist/` at build time:

- `public/_headers` → `dist/_headers` — cache policy for HTML, service worker, hashed assets, and `/data/*.json`. Workers Static Assets parses `_headers` from the assets directory ([docs](https://developers.cloudflare.com/workers/static-assets/headers/)).

**SPA routing (Workers):** Do **not** ship a Pages-style `_redirects` catch-all such as `/* /index.html 200`. Workers Static Assets treats that as an infinite redirect loop (error 100324). Client-side routing and hard refreshes are handled entirely by `wrangler.toml` → `[assets] not_found_handling = "single-page-application"`: existing files under `/assets/*` and `/data/*` are served when present; any other unmatched path returns `index.html` with HTTP 200. No `_redirects` file is required or shipped for this repo.

`wrangler.toml` configures Workers Static Assets:

- `[assets] directory = "./dist"` — upload target after `npm run build`
- `not_found_handling = "single-page-application"` — SPA fallback (replaces any legacy `_redirects` rule)
- No `main` Worker script — pure static hosting

### 3.4 Production URL

When the first build finishes, Cloudflare assigns a URL like:

```
https://restaurant-simulator.pages.dev
```

(or similar based on your project name). Every push to `main` triggers a new production deploy. Pull requests get preview URLs automatically.

---

## 4. Verify the first deploy

### 4.1 CI on GitHub

1. Open your repo → **Actions**
2. Confirm the **CI** workflow is green on `main`
3. Open the **Bundle size gate** step log — you should see measured gzip bytes and `PASS`

CI enforces: content validation, typecheck, lint, fast tests, CC0 asset rebuild + audit, production build, and initial JS gzip ≤ 190,000 bytes.

### 4.2 Browser smoke test

On the Cloudflare Pages URL:

1. Open DevTools → **Network** → disable cache → hard refresh
2. Confirm `index.html` returns **200**
3. Confirm `/data/ingredients.json` (and other `/data/*.json`) return **200** with `Content-Type: application/json`
4. Confirm `/assets/index-*.js` returns **200**
5. Confirm no red errors in the **Console**
6. Game shell loads (splash / restaurant view depending on build phase)

### 4.3 PWA / service worker

1. DevTools → **Application** → **Service Workers** — a worker should register
2. DevTools → **Application** → **Cache Storage** — precache should include `index.html`, hashed `/assets/*`, and `/data/*.json` (needed for offline play after first load)
3. Optional: **Network** → **Offline** → refresh — app shell and cached content should still load

### 4.4 Cache headers (why they matter)

| Path | Policy | Reason |
|------|--------|--------|
| `/assets/*` | `immutable`, 1 year | Filenames are content-hashed; safe to cache forever |
| `/index.html` | `no-cache, must-revalidate` | Must pick up new hashed asset references after deploy |
| `/sw.js` | `no-cache, must-revalidate` | Stale service worker strands players on old builds; with IndexedDB saves, that can mean lost progress or broken migrations |
| `/data/*.json` | `max-age=0, must-revalidate` | Content changes on rebuild but paths are not hashed; browsers revalidate while SW precache serves offline copies |

---

## 5. Test on a real iPhone

Mobile Safari is the primary target (iPhone 17 class devices).

### 5.1 Load the site

1. On iPhone, open Safari
2. Navigate to your Cloudflare Pages URL (or custom domain)
3. Confirm layout fits the screen and touch targets respond

### 5.2 Add to Home Screen (important for saves)

iOS Safari deletes script-writable storage (IndexedDB, service worker cache) after ~7 days without visiting the site **unless** the app is added to the Home Screen or persistent storage is granted.

1. Tap the **Share** button
2. Tap **Add to Home Screen**
3. Confirm name and tap **Add**
4. Launch the game from the Home Screen icon (standalone mode)

Play through at least one service day, force-quit, and relaunch from the Home Screen icon to confirm saves persist.

### 5.3 Save durability checklist

- [ ] Launched from Home Screen icon (not only a Safari tab)
- [ ] Not using Private Browsing
- [ ] Progress survives app restart
- [ ] Settings → Save Code export/import works as a manual backup

See `docs/RESEARCH.md` §7 for the full iOS storage model.

---

## 6. Custom domain (optional)

Cloudflare Pages includes free HTTPS on `*.pages.dev` and on custom domains.

1. Cloudflare dashboard → your Pages project → **Custom domains**
2. Click **Set up a custom domain**
3. Enter e.g. `restaurant.example.com`
4. If the domain is already on Cloudflare, DNS is configured automatically
5. If not, add the CNAME record Cloudflare shows at your DNS provider
6. Wait for certificate provisioning (usually minutes)

No Vite `base` change is needed for a root custom domain — keep default base `/`.

---

## 7. GitHub Pages fallback

Use GitHub Pages if Cloudflare is unavailable. **Project pages** live at a subpath:

```
https://YOUR_USER.github.io/YOUR_REPO/
```

That subpath affects Vite `base` and `/data/` fetches. The build pipeline patches content URLs via `import.meta.env.BASE_URL` (see `vite.config.ts`).

### 7.1 Enable GitHub Pages

1. Repo → **Settings** → **Pages**
2. **Source:** GitHub Actions

### 7.2 Deploy via workflow (recommended)

1. Repo → **Actions** → **Deploy GitHub Pages (backup)** → **Run workflow**
2. Set **base_path** to `/YOUR_REPO/` (leading and trailing slashes required), e.g. `/restaurant-simulator/`
3. Run on `main`

When complete, Settings → Pages shows the live URL.

### 7.3 Manual local build (alternative)

```bash
npm run sync:data
npm run build -- --base /YOUR_REPO/
npm run size:check
# upload dist/ contents to a gh-pages branch or use `npx gh-pages -d dist`
```

### 7.4 GitHub Pages vs Cloudflare differences

| Topic | Cloudflare Pages | GitHub Pages (project site) |
|-------|------------------|----------------------------|
| URL | `*.pages.dev` or custom domain at `/` | `username.github.io/REPO/` subpath |
| Vite `base` | `/` (default) | `/REPO/` |
| Content fetch | `/data/*.json` | `/REPO/data/*.json` (via BASE_URL patch) |
| Bandwidth | Unlimited (free) | ~100 GB/month soft limit |

For a **user site** (`YOUR_USER.github.io` repo), base stays `/` — same as Cloudflare.

---

## 8. Rollback a bad deploy

### Cloudflare Pages

1. Dashboard → **Workers & Pages** → your project → **Deployments**
2. Find the last known-good deployment
3. Click **⋯** → **Rollback to this deployment**

Rollback is instant. Because `/index.html` and the service worker use `no-cache`, players pick up the rolled-back shell on next visit.

### GitHub Pages

1. Re-run **Deploy GitHub Pages (backup)** from a good commit on `main`, or
2. Revert the bad commit on `main` and push:

```bash
git revert HEAD
git push origin main
```

Then re-run the Pages deploy workflow.

---

## 9. Troubleshooting

### Build succeeds but deploy fails (`wrangler deploy` / missing entry-point)

**Symptoms:** Build log shows `npm run build` finished, then deploy fails with:

```
Executing user deploy command: npx wrangler deploy
✘ [ERROR] Missing entry-point to Worker script or to assets directory
```

**Cause (Workers path):** `wrangler.toml` is missing `[assets]` or `directory` does not point at the built output. Cloudflare runs `npx wrangler deploy` when it classifies the repo as a Worker.

**Fix (Workers + Static Assets — this repo):**

1. Confirm `wrangler.toml` contains `[assets]` with `directory = "./dist"` and `not_found_handling = "single-page-application"`
2. Confirm **Build command** is `npm run build` and **Deploy command** is blank or `npx wrangler deploy`
3. Retry the deployment after pushing an updated `wrangler.toml`

**Cause (classic Pages path):** Deploy command was set to `npx wrangler deploy` on a Pages-only project without `[assets]`.

**Fix (classic Pages):**

1. Clear **Deploy command** (leave blank)
2. Set **Build output directory** to `dist`
3. Retry the deployment

### Blank page after deploy

**Symptoms:** White or empty screen; console 404 on `/assets/index-*.js`.

**Checks:**

1. Cloudflare **Build output directory** is exactly `dist` (not `./dist/` typo — either works, but must not be `build/` or repo root)
2. Build command includes `npm run sync:data && npm run build`
3. Open `/index.html` source in browser — script `src` paths should match files under `/assets/`
4. For GitHub Pages: rebuild with correct `--base /REPO/`

### Content `/data/` 404s

**Symptoms:** Console `Failed to load content asset ingredients.json: 404`.

**Checks:**

1. `dist/data/` exists in the build artifact (CI build log → browse files, or download artifact)
2. Build runs `sync:data` before `vite build` (copies `src/data/*.json` → `public/data/` → `dist/data/`)
3. On GitHub Pages: confirm you built with `--base /REPO/` and open Network tab — requests should go to `/REPO/data/ingredients.json`, not `/data/ingredients.json`
4. Confirm `wrangler.toml` has `not_found_handling = "single-page-application"` (do not add a `_redirects` catch-all on Workers)

### Service worker serving stale builds

**Symptoms:** Old UI after deploy; new features missing; possible save schema mismatch.

**Checks:**

1. Confirm `public/_headers` is in the deployed `dist/` root with `no-cache` on `/sw.js`
2. Hard refresh once (or close all tabs for the origin)
3. DevTools → Application → Service Workers → **Unregister**, then reload
4. On iOS Home Screen app: delete the icon, clear Safari website data for the origin, re-add to Home Screen

**Why this matters:** A stale service worker can cache old JS while IndexedDB holds saves from a newer version — the worst case for a save-game PWA.

### Saves disappearing on iOS

**Symptoms:** Progress gone after a week or after iOS update.

**Likely causes:**

1. Played only in Safari tabs, never added to Home Screen (7-day ITP eviction)
2. Private Browsing
3. User cleared website data
4. Storage not persisted and `navigator.storage.persist()` denied

**Mitigations:** Add to Home Screen, export Save Codes regularly, show in-game warnings (Phase 6 settings).

### Bundle-gate CI failures

**Symptoms:** CI fails at **Bundle size gate** with `FAIL: initial app JS gzip … exceeds hard cap 190,000`.

**Checks:**

1. Read the CI log — it prints per-chunk gzip and total
2. Run locally: `npm run build && npm run size:check`
3. Look for accidental static imports of heavy modules (PixiJS should stay mostly dynamic)
4. `/data/*.json` growth is printed separately and does not fail the JS gate, but boot JSON over ~7,000 gzip or deferred over ~34,000 gzip may affect load time — see `docs/Tech-Stack.md` §3

To run deep balance sim tests manually: Actions → **Deep simulation tests** → **Run workflow**.

---

## 10. Free-tier limits

Both hosts are sufficient for this static game at expected traffic.

### Cloudflare Pages (primary)

| Limit | Free tier | This project |
|-------|-----------|--------------|
| Bandwidth | Unlimited | Static files + JSON; no uploads |
| Builds | 500 / month | One build per push + PR previews |
| Files per deployment | 20,000 | ~30 files today |
| Max file size | 25 MiB | Largest file ~287 KB (`recipes.json`) |
| Custom domains | 100 | Optional |

Source: [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)

### GitHub Pages (backup)

| Limit | Free tier | This project |
|-------|-----------|--------------|
| Bandwidth | ~100 GB / month (soft) | Low-traffic fallback |
| Build minutes | 2,000 / month (Actions) | One deploy per manual/nightly run |
| Repository size | 1 GB recommended | Well under |
| Commercial use on free | Restricted for SaaS/commercial sites | Acceptable as personal/free-game backup per `docs/RESEARCH.md` §6 |

Source: [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)

### GitHub Actions CI

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **CI** | Every push/PR to `main` | validate, typecheck, lint, fast test, build, bundle gate |
| **Deep simulation tests** | Manual + nightly 06:00 UTC | `test:sim` only (~2.5 min) |
| **Deploy GitHub Pages (backup)** | Manual only | Fallback hosting |

---

## Quick reference

| Task | Command / location |
|------|-------------------|
| Local dev | `npm run dev` |
| Regenerate content JSON | `npm run build:content` |
| Copy content to public | `npm run sync:data` |
| Production build | `npm run build` |
| Bundle gate | `npm run size:check` |
| Full deploy docs | This file |
| Cache headers | `public/_headers` |
| SPA fallback | `wrangler.toml` → `not_found_handling = "single-page-application"` |
| Cloudflare Workers config | `wrangler.toml` (`[assets]` → `dist/`) |
