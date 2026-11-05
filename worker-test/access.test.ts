import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { setJwksForTesting } from '../worker/access';
import { handleError } from '../worker/errors';
import type { AppEnv } from '../worker/env';
import {
  ACCESS_TEST_ENV,
  api,
  signTestJwt,
  tamperEmail,
  testJwks,
  untrustedPrivateKey,
} from './helpers';

const PROD = { ...ACCESS_TEST_ENV };

async function call(token?: string, overrides: Record<string, unknown> = {}) {
  const headers: Record<string, string> = token ? { 'Cf-Access-Jwt-Assertion': token } : {};
  return api('/api/health', { headers }, { ...PROD, ...overrides });
}

describe('accessAuth', () => {
  beforeAll(() => setJwksForTesting(testJwks));
  afterAll(() => setJwksForTesting(null));
  // Rejections are logged; keep test output quiet.
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('401 without a token', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('200 with a valid token', async () => {
    const res = await call(await signTestJwt({ email: 'thomas@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('matches allowed emails case-insensitively', async () => {
    const res = await call(await signTestJwt({ email: 'Partner@Example.com' }));
    expect(res.status).toBe(200);
  });

  it('401 with the wrong audience', async () => {
    const res = await call(await signTestJwt({ email: 'thomas@example.com', aud: 'other' }));
    expect(res.status).toBe(401);
  });

  it('401 with the wrong issuer', async () => {
    const res = await call(
      await signTestJwt({ email: 'thomas@example.com', iss: 'https://evil.cloudflareaccess.com' }),
    );
    expect(res.status).toBe(401);
  });

  it('401 with an expired token', async () => {
    const res = await call(
      await signTestJwt({ email: 'thomas@example.com', expSecondsFromNow: -60 }),
    );
    expect(res.status).toBe(401);
  });

  it('401 when signed by a different key with the trusted kid', async () => {
    const res = await call(
      await signTestJwt({ email: 'thomas@example.com', signingKey: untrustedPrivateKey }),
    );
    expect(res.status).toBe(401);
  });

  it('401 when the payload is tampered with but the signature is kept', async () => {
    const token = await signTestJwt({ email: 'stranger@example.com' });
    const res = await call(tamperEmail(token, 'thomas@example.com'));
    expect(res.status).toBe(401);
  });

  it('401 for a token without exp', async () => {
    const res = await call(await signTestJwt({ email: 'thomas@example.com', omitExp: true }));
    expect(res.status).toBe(401);
  });

  it('500 internal when ACCESS_AUD or ACCESS_TEAM_DOMAIN is empty (fails closed)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const token = await signTestJwt({ email: 'thomas@example.com' });
    for (const overrides of [
      { ACCESS_AUD: '' },
      { ACCESS_TEAM_DOMAIN: '' },
      { ACCESS_AUD: undefined },
    ]) {
      const res = await call(token, overrides);
      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({ error: { code: 'internal' } });
    }
  });

  it('403 for a valid token with an email that is not allowed', async () => {
    const res = await call(await signTestJwt({ email: 'stranger@example.com' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'forbidden' } });
  });

  it('does not bypass when ENVIRONMENT is not local, even with DEV_USER_EMAIL set', async () => {
    const res = await call(undefined, { DEV_USER_EMAIL: 'thomas@example.com' });
    expect(res.status).toBe(401);
  });

  it.each([undefined, 'Local', 'LOCAL', 'localhost'])(
    'does not bypass when ENVIRONMENT is %s',
    async (environment) => {
      const res = await call(undefined, {
        ENVIRONMENT: environment,
        DEV_USER_EMAIL: 'thomas@example.com',
      });
      expect(res.status).toBe(401);
    },
  );

  it('bypasses with DEV_USER_EMAIL when ENVIRONMENT is local, and creates the member', async () => {
    const res = await api('/api/health');
    expect(res.status).toBe(200);
    const row = await env.DB.prepare('SELECT display_name FROM members WHERE email = ?')
      .bind('thomas@example.com')
      .first<{ display_name: string }>();
    expect(row?.display_name).toBe('Thomas');
  });

  it('does not overwrite an existing member', async () => {
    await env.DB.prepare('INSERT INTO members (email, display_name, created_at) VALUES (?, ?, ?)')
      .bind('fixture@example.com', 'Bunny', '2026-11-05T00:00:00.000Z')
      .run();
    await api('/api/health', {}, { DEV_USER_EMAIL: 'fixture@example.com' });
    const row = await env.DB.prepare('SELECT display_name FROM members WHERE email = ?')
      .bind('fixture@example.com')
      .first<{ display_name: string }>();
    expect(row?.display_name).toBe('Bunny');
  });
});

describe('app errors', () => {
  it('404 not_found JSON for unknown /api routes', async () => {
    const res = await api('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});

describe('handleError', () => {
  const app = new Hono<AppEnv>();
  app.get('/zod', () => {
    z.object({ a: z.string() }).parse({});
    return new Response();
  });
  app.get('/boom', () => {
    throw new Error('secret internals');
  });
  app.onError(handleError);

  it('maps ZodError to 400 validation_failed with the issues', async () => {
    const res = await app.request('/zod');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; details: unknown[] } };
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details).toHaveLength(1);
  });

  it('maps other errors to a generic 500 without a stack', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('/boom');
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      error: { code: 'internal', message: 'Something went wrong' },
    });
    expect(text).not.toContain('secret internals');
    expect(text).not.toContain(' at ');
  });
});
