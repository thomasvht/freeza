import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import type { MiddlewareHandler } from 'hono';
import { defaultDisplayName } from './display-name';
import type { AppEnv } from './env';
import { apiError } from './errors';

let jwks: JWTVerifyGetKey | null = null;
let jwksTeam: string | null = null;

/** Test seam: inject a local key set, or pass null to go back to the remote one. */
export function setJwksForTesting(keys: JWTVerifyGetKey | null): void {
  jwks = keys;
  jwksTeam = null;
}

function getJwks(teamDomain: string): JWTVerifyGetKey {
  if (jwks && (jwksTeam === null || jwksTeam === teamDomain)) return jwks;
  jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  jwksTeam = teamDomain;
  return jwks;
}

function isAllowed(email: string, allowed: string | undefined): boolean {
  const list = (allowed ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

export function accessAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    let email: string;

    // Local-dev bypass. Must stay strictly tied to ENVIRONMENT === 'local'.
    if (c.env.ENVIRONMENT === 'local') {
      if (!c.env.DEV_USER_EMAIL) {
        return apiError(c, 401, 'unauthorized', 'DEV_USER_EMAIL is not set');
      }
      email = c.env.DEV_USER_EMAIL;
    } else {
      const token = c.req.header('Cf-Access-Jwt-Assertion');
      if (!token) return apiError(c, 401, 'unauthorized', 'Missing access token');
      try {
        const { payload } = await jwtVerify(token, getJwks(c.env.ACCESS_TEAM_DOMAIN), {
          issuer: `https://${c.env.ACCESS_TEAM_DOMAIN}`,
          audience: c.env.ACCESS_AUD,
        });
        if (typeof payload['email'] !== 'string' || payload['email'] === '') {
          return apiError(c, 401, 'unauthorized', 'Invalid access token');
        }
        email = payload['email'];
      } catch {
        return apiError(c, 401, 'unauthorized', 'Invalid access token');
      }
      if (!isAllowed(email, c.env.ALLOWED_EMAILS)) {
        return apiError(c, 403, 'forbidden', 'Not allowed');
      }
    }

    email = email.toLowerCase();
    await c.env.DB.prepare(
      'INSERT INTO members (email, display_name, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING',
    )
      .bind(email, defaultDisplayName(email), new Date().toISOString())
      .run();

    c.set('email', email);
    return next();
  };
}
