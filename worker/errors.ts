import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import type { ApiErrorCode } from '../shared/api-types';

export function apiError(
  c: Context,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): Response {
  const error = details === undefined ? { code, message } : { code, message, details };
  return c.json({ error }, status as ContentfulStatusCode);
}

/** Maps unhandled errors to the API error envelope. Never leaks a stack. */
export function handleError(err: Error, c: Context): Response {
  if (err instanceof ZodError) {
    return apiError(c, 400, 'validation_failed', 'Validation failed', err.issues);
  }
  console.error(err);
  return apiError(c, 500, 'internal', 'Something went wrong');
}
