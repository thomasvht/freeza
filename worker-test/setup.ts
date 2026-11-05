import { applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Migrations are idempotent here: applyD1Migrations skips the ones already applied.
await applyD1Migrations(
  env.DB,
  (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS,
);
