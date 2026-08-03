# CI maintenance guide

The CI workflow lives in `.github/workflows/ci.yml`. It is intentionally one
job so Node setup, checkout, and `npm ci` happen only once per pull request.
Expensive content, asset, and browser checks are enabled from the changed-file
scope instead of running for every edit.

## When CI runs

- Non-draft pull requests targeting `main`.
- When a draft pull request is marked ready for review.
- Manual runs from **Actions → CI → Run workflow**.
- Documentation-only changes run checkout and scope detection so the required
  check can pass, then skip Node, tests, builds, assets, and Chromium.
- Pushes to a draft pull request create a skipped check and use no runner time.
- Merging does not repeat the same CI work on `main`; the pull-request check is
  the merge gate. Protect `main` and require the `CI / verify` check rather than
  relying on direct pushes.

A manual run enables every conditional scope. Use it after changing scope
rules, dependency versions, build tooling, or when a complete audit is useful.

## Checks and scopes

These checks always run for a non-documentation, non-draft pull request:

1. Install locked Node dependencies.
2. Sync runtime data.
3. Typecheck.
4. Lint.
5. Install the locked Python dependencies required by asset-backed unit tests.
6. Run unit and simulation tests.
7. Make a production Vite build without repeating sync and typecheck.
8. Enforce the bundle-size budget.

The `Detect change scope` step controls the checks:

- `core`: skips dependency installation and all code checks for
  documentation-only changes while still reporting a successful required check.
- `content`: validates content invariants when game data, the content loader,
  domain context, or the validator changes.
- `assets`: installs Python, rebuilds CC0 assets, and audits licensing when
  vendored/generated assets, shipped assets, asset scripts, relevant ingredient
  data, Python requirements, or the audit itself changes.
- `e2e`: installs Chromium and runs Playwright when browser-visible runtime
  code, floor/state behavior, public files, browser tests/configuration, Vite
  configuration, or package dependencies change. `playwright.config.ts` defaults
  to the **chromium** project only so CI matches what it installs. Extra
  engines are opt-in locally via `PLAYWRIGHT_BROWSERS` (e.g.
  `chromium,firefox`). Do not add a default Firefox/WebKit project unless CI
  also installs that browser.

Core checks must not become conditional on these scopes. A unit-only domain
change should still typecheck, lint, test, build, and pass the size gate.

## Maintaining the path rules

The path expressions are anchored regular expressions inside `Detect change
scope`. When adding or moving files:

1. Add any new content source or validator input to `content`.
2. Add every input that can change generated assets or `CREDITS.json` to
   `assets`.
3. Add browser-visible runtime code and anything that can change an end-to-end
   flow to `e2e`.
4. Prefer a directory prefix for a cohesive subsystem and an exact filename for
   isolated configuration.
5. Run the workflow manually once after changing the expressions; manual runs
   force all three scopes to `true`.

Do not exclude a path merely because its test is currently slow. Optimize the
test or its setup while preserving the coverage.

## Local validation

Run the same core commands before publishing:

```bash
npm ci
npm run sync:data
npm run typecheck
npm run lint
npm run test
npm run build
npm run size:check
```

When the relevant scope changes, also run:

```bash
npm run validate:content
npm run build:assets
npm run audit:assets
npm run test:e2e
```

Playwright requires a locally installed Chromium build (`npx playwright install
chromium`). Default `npm run test:e2e` runs the chromium project only. To also
exercise Firefox locally:

```bash
npx playwright install firefox
PLAYWRIGHT_BROWSERS=chromium,firefox npm run test:e2e
```

WebKit/iOS Playwright coverage is not part of CI and remains unverified in the
agent sandbox. If the local browser is unavailable, leave the relevant PR
non-draft and use the GitHub `CI / verify` result as the browser gate.
