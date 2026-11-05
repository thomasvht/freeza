import { env } from 'cloudflare:workers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setJwksForTesting } from '../worker/access';
import { ACCESS_TEST_ENV, api, signTestJwt, testJwks } from './helpers';

const PROD = { ...ACCESS_TEST_ENV };

async function call(token?: string, overrides: Record<string, unknown> = {}) {
  const headers: Record<string, string> = token ? { 'Cf-Access-Jwt-Assertion': token } : {};
  return api('/api/health', { headers }, { ...PROD, ...overrides });
}

describe('accessAuth', () => {
  beforeAll(() => setJwksForTesting(testJwks));
  afterAll(() => setJwksForTesting(null));

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

  it('403 for a valid token with an email that is not allowed', async () => {
    const res = await call(await signTestJwt({ email: 'stranger@example.com' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'forbidden' } });
  });

  it('does not bypass when ENVIRONMENT is not local, even with DEV_USER_EMAIL set', async () => {
    const res = await call(undefined, { DEV_USER_EMAIL: 'thomas@example.com' });
    expect(res.status).toBe(401);
  });

  it('bypasses with DEV_USER_EMAIL when ENVIRONMENT is local, and creates the member', async () => {
    const res = await api('/api/health');
    expect(res.status).toBe(200);
    const row = await env.DB.prepare('SELECT display_name FROM members WHERE email = ?')
      .bind('thomas@example.com')
      .first<{ display_name: string }>();
    expect(row?.display_name).toBe('Thomas');
  });

  it('does not overwrite an existing member', async () => {
    await env.DB.prepare('UPDATE members SET display_name = ? WHERE email = ?')
      .bind('Tom', 'thomas@example.com')
      .run();
    await api('/api/health');
    const row = await env.DB.prepare('SELECT display_name FROM members WHERE email = ?')
      .bind('thomas@example.com')
      .first<{ display_name: string }>();
    expect(row?.display_name).toBe('Tom');
  });
});

describe('app errors', () => {
  it('404 not_found JSON for unknown /api routes', async () => {
    const res = await api('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});
