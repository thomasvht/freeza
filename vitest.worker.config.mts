import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

export default defineConfig({
  test: {
    projects: [
      {
        // Plain Node: the zone is pinned so local-date and DST tests are meaningful on UTC machines (CI).
        // workerd may ignore TZ, which is why these tests stay out of the workers pool.
        test: {
          name: 'shared',
          include: ['shared/**/*.test.ts'],
          env: { TZ: 'Europe/Brussels' },
        },
      },
      {
        plugins: [
          cloudflareTest(async () => {
            const migrations = await readD1Migrations(path.join(root, 'migrations'));
            return {
              wrangler: { configPath: './worker-test/wrangler.jsonc' },
              remoteBindings: false,
              miniflare: {
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  ENVIRONMENT: 'local',
                  DEV_USER_EMAIL: 'thomas@example.com',
                  ALLOWED_EMAILS: 'thomas@example.com,partner@example.com',
                },
              },
            };
          }),
        ],
        resolve: { alias: { '@shared': path.join(root, 'shared') } },
        test: {
          name: 'worker',
          include: ['worker-test/**/*.test.ts'],
          setupFiles: ['./worker-test/setup.ts'],
        },
      },
    ],
  },
});
