import { defineConfig, devices, type Project } from '@playwright/test';

const port = 4173;
const host = '127.0.0.1';

const previewCommand = [
  'mkdir -p public/data',
  'cp src/data/*.json public/data/',
  'node node_modules/typescript/bin/tsc',
  'node node_modules/vite/bin/vite.js build',
  `node node_modules/vite/bin/vite.js preview --host ${host} --port ${port}`,
].join(' && ');

/**
 * Default matches CI (`.github/workflows/ci.yml` installs Chromium only).
 * Opt in locally: `PLAYWRIGHT_BROWSERS=chromium,firefox npm run test:e2e`
 * WebKit/iOS remain unverified in this environment (missing sandbox libs).
 */
const requestedBrowsers = (process.env.PLAYWRIGHT_BROWSERS ?? 'chromium')
  .split(',')
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean);

const browserProjects: Record<string, Project> = {
  chromium: {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
  firefox: {
    name: 'firefox',
    use: {
      ...devices['Desktop Firefox'],
      launchOptions: {
        firefoxUserPrefs: {
          'dom.storageManager.prompt.testing': true,
          'dom.storageManager.prompt.testing.allow': true,
        },
      },
    },
  },
};

const projects = requestedBrowsers.map((name) => {
  const project = browserProjects[name];
  if (!project) {
    throw new Error(
      `Unknown PLAYWRIGHT_BROWSERS entry "${name}". Use chromium and/or firefox.`,
    );
  }
  return project;
});

if (projects.length === 0) {
  throw new Error('PLAYWRIGHT_BROWSERS resolved to an empty project list.');
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: `http://${host}:${port}`,
    trace: 'on-first-retry',
    actionTimeout: 10_000,
  },
  projects,
  webServer: {
    command: previewCommand,
    url: `http://${host}:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
