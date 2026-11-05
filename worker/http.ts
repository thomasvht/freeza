import type { Context } from 'hono';
import type { ZodType } from 'zod';
import type { AppEnv } from './env';
import { apiError } from './errors';

type Ctx = Context<AppEnv>;

/** Parses the JSON body with `schema`. A missing body counts as `{}` when `optional`. */
export async function parseBody<T>(
  c: Ctx,
  schema: ZodType<T>,
  optional = false,
): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  let raw: unknown;
  const text = await c.req.text();
  if (text.trim() === '' && optional) {
    raw = {};
  } else {
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, res: apiError(c, 400, 'validation_failed', 'Body must be valid JSON') };
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      res: apiError(c, 400, 'validation_failed', 'Validation failed', parsed.error.issues),
    };
  }
  return { ok: true, data: parsed.data };
}
