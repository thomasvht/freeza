import { env } from 'cloudflare:workers';
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { vi } from 'vitest';
import { app } from '../worker/index';
import type { Env } from '../worker/env';

export const TEST_ENV = {
  ENVIRONMENT: 'local',
  DEV_USER_EMAIL: 'thomas@example.com',
  ALLOWED_EMAILS: 'thomas@example.com,partner@example.com',
} as const;

export const ACCESS_TEST_ENV = {
  ENVIRONMENT: 'production',
  ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
  ACCESS_AUD: 'aud-1',
} as const;

/** AI stub: tests set its behaviour with `aiRun.mockResolvedValue(...)`. */
export const aiRun = vi.fn();

const keyPair = await generateKeyPair('RS256');
const publicJwk = { ...(await exportJWK(keyPair.publicKey)), kid: 'test-key', alg: 'RS256' };

/** A JWKS that trusts only the test key pair. Pass it to `setJwksForTesting`. */
export const testJwks: JWTVerifyGetKey = createLocalJWKSet({ keys: [publicJwk] });

export async function signTestJwt(claims: {
  email: string;
  aud?: string;
  iss?: string;
  expSecondsFromNow?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setAudience(claims.aud ?? ACCESS_TEST_ENV.ACCESS_AUD)
    .setIssuer(claims.iss ?? `https://${ACCESS_TEST_ENV.ACCESS_TEAM_DOMAIN}`)
    .setIssuedAt(now - 10)
    .setExpirationTime(now + (claims.expSecondsFromNow ?? 300))
    .sign(keyPair.privateKey);
}

export function api(
  path: string,
  init?: RequestInit,
  envOverrides: Partial<Record<keyof Env, unknown>> = {},
): Response | Promise<Response> {
  const testEnv = {
    ...env,
    ...TEST_ENV,
    AI: { run: aiRun },
    ...envOverrides,
  };
  return app.request(path, init, testEnv);
}
