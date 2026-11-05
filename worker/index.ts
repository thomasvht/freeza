import { Hono } from 'hono';
import { accessAuth } from './access';
import type { AppEnv } from './env';
import { apiError, handleError } from './errors';

export const app = new Hono<AppEnv>();

app.use('/api/*', accessAuth());

app.get('/api/health', (c) => c.json({ ok: true }));

app.all('/api/*', (c) => apiError(c, 404, 'not_found', 'Not found'));

app.onError(handleError);

export default { fetch: app.fetch };
