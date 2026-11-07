import { Hono } from 'hono';
import { PatchMeBodySchema } from '../../shared/api-types';
import { rowToMemberDto, type MemberRow } from '../db';
import type { AppEnv } from '../env';
import { apiError } from '../errors';
import { parseBody } from '../http';

export const meRoutes = new Hono<AppEnv>();

meRoutes.patch('/', async (c) => {
  const parsed = await parseBody(c, PatchMeBodySchema);
  if (!parsed.ok) return parsed.res;

  const row = await c.env.DB
    .prepare('UPDATE members SET display_name = ?1 WHERE email = ?2 RETURNING email, display_name')
    .bind(parsed.data.displayName, c.var.email)
    .first<MemberRow>();
  if (!row) return apiError(c, 404, 'not_found', 'Member not found');
  return c.json(rowToMemberDto(row));
});
