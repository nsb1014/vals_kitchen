# Restaurant Simulator

A mobile-first, tap-paced restaurant management game. Serve customers one at a time by composing dishes from unlocked ingredients to match taste preferences (never dish names), grow your kitchen, and chase prestige over hundreds of in-game days.

## Local development

```bash
npm install
npm run build:content   # regenerate src/data JSON from scripts/
npm run sync:data       # copy src/data/*.json → public/data/ (required before build)
npm run dev
```

Open the dev server URL in a mobile viewport (~390×844) for best results.

### npm not on PATH

Some environments ship Node without npm on `PATH`. Install [Node.js 20 LTS](https://nodejs.org/) (includes npm), or run the toolchain directly from the repo root:

```bash
node node_modules/vite/bin/vite.js          # dev server
node node_modules/typescript/bin/tsc        # typecheck
node node_modules/vitest/vitest.mjs run     # tests
node node_modules/tsx/dist/cli.mjs scripts/check-bundle-size.ts
```

## Build

```bash
npm run sync:data
npm run typecheck
npm run lint
npm run test
npm run build
npm run size:check    # initial JS gzip gate (190,000-byte cap)
```

Production output is written to `dist/` (includes `/data/*.json`, service worker, and PWA manifest).

## Test

```bash
npm run test              # fast unit suite (CI on every push)
npm run validate:content  # content invariant validators (V1–V9)
```

## Deploy

**Primary:** [Cloudflare Pages](https://pages.cloudflare.com/) — unlimited bandwidth, free HTTPS, Git deploy.

**Backup:** GitHub Pages (project subpath; requires `--base /REPO/`).

Full copy-paste setup (GitHub repo, Cloudflare connection, iPhone PWA testing, rollback, troubleshooting):

**[docs/Deployment.md](./docs/Deployment.md)**

CI (`.github/workflows/ci.yml`) runs on every push/PR: content validation, typecheck, lint, fast tests, build, and bundle size gate.

## Design docs

| Document | Contents |
|----------|----------|
| [docs/PRD.md](./docs/PRD.md) | Gameplay formulas and product rules |
| [docs/Tech-Stack.md](./docs/Tech-Stack.md) | Stack, bundle budget, hosting |
| [docs/Deployment.md](./docs/Deployment.md) | Hosting setup instructions |
