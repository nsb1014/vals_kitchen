import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const host = '127.0.0.1';

const previewCommand = [
  'mkdir -p public/data',
  'cp src/data/*.json public/data/',
  'node node_modules/typescript/bin/tsc',
  'node node_modules/vite/bin/vite.js build',
  `node node_modules/vite/bin/vite.js preview --host ${host} --port ${port}`,
].join(' && ');

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
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: previewCommand,
    url: `http://${host}:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
