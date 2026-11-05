import { defineConfig, devices } from '@playwright/test';

const PORT = 8787;
const STATE_DIR = '.wrangler/e2e';
const VARS = [
  'ENVIRONMENT:local',
  'DEV_USER_EMAIL:owner@example.com',
  'ALLOWED_EMAILS:owner@example.com,partner@example.com',
]
  .map((v) => `--var ${v}`)
  .join(' ');

// Fresh local D1 state on every run: wipe, migrate into it, then serve from it.
const SERVER = [
  `rm -rf ${STATE_DIR}`,
  'npm run build',
  `npx wrangler d1 migrations apply freeza-db --local --persist-to ${STATE_DIR}`,
  `npx wrangler dev --port ${PORT} --persist-to ${STATE_DIR} ${VARS}`,
].join(' && ');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The prod build registers a service worker; keep caching out of the tests.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    ...devices['iPhone 14'],
    browserName: 'chromium',
  },
  webServer: {
    command: SERVER,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
