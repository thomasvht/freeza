import { defineConfig } from 'vitest/config';

// Pin the zone so local-date and DST tests are meaningful on UTC machines (CI).
process.env['TZ'] = 'Europe/Brussels';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'worker-test/**/*.test.ts'],
  },
});
