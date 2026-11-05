import { Hono } from 'hono';
import { accessAuth } from './access';
import type { AppEnv } from './env';
import { apiError, handleError } from './errors';
import { inventoryRoutes } from './routes/inventory';
import { itemRoutes } from './routes/items';

export const app = new Hono<AppEnv>();

app.use('/api/*', accessAuth());

app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api/inventory', inventoryRoutes);
app.route('/api/items', itemRoutes);

app.all('/api/*', (c) => apiError(c, 404, 'not_found', 'Not found'));

app.onError(handleError);

export default { fetch: app.fetch };
