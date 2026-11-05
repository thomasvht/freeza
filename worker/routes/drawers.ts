import { Hono } from 'hono';
import {
  CreateDrawerBodySchema,
  DrawerOrderBodySchema,
  PatchDrawerBodySchema,
} from '../../shared/api-types';
import { rowToDrawerDto, type DrawerRow } from '../db';
import type { AppEnv } from '../env';
import { apiError } from '../errors';
import { parseBody } from '../http';

const MAX_ACTIVE_DRAWERS = 10;

export const drawerRoutes = new Hono<AppEnv>();

drawerRoutes.post('/', async (c) => {
  const parsed = await parseBody(c, CreateDrawerBodySchema);
  if (!parsed.ok) return parsed.res;

  // Single statement: the limit check and the position are evaluated atomically with the insert.
  const row = await c.env.DB
    .prepare(
      `INSERT INTO drawers (id, name, position, created_at)
       SELECT ?1, ?2, COALESCE(MAX(position), 0) + 1, ?3
       FROM drawers WHERE deleted_at IS NULL
       HAVING COUNT(*) < ?4
       RETURNING id, name, position`,
    )
    .bind(crypto.randomUUID(), parsed.data.name, new Date().toISOString(), MAX_ACTIVE_DRAWERS)
    .first<DrawerRow>();
  if (!row) {
    return apiError(c, 409, 'drawer_limit', `At most ${MAX_ACTIVE_DRAWERS} drawers are allowed`);
  }
  return c.json(rowToDrawerDto(row), 201);
});

// Registered before '/:id' routes; PUT does not clash with them anyway.
drawerRoutes.put('/order', async (c) => {
  const parsed = await parseBody(c, DrawerOrderBodySchema);
  if (!parsed.ok) return parsed.res;
  const { ids } = parsed.data;

  const db = c.env.DB;
  const active = await db
    .prepare('SELECT id FROM drawers WHERE deleted_at IS NULL')
    .all<{ id: string }>();
  const activeIds = new Set(active.results.map((r) => r.id));
  if (new Set(ids).size !== ids.length || ids.length !== activeIds.size || !ids.every((id) => activeIds.has(id))) {
    return apiError(c, 400, 'validation_failed', 'ids must be exactly the active drawers', [
      { path: 'ids', message: 'Must list each active drawer exactly once' },
    ]);
  }

  await db.batch(
    ids.map((id, i) =>
      db.prepare('UPDATE drawers SET position = ?1 WHERE id = ?2 AND deleted_at IS NULL').bind(i + 1, id),
    ),
  );
  const rows = await db
    .prepare('SELECT id, name, position FROM drawers WHERE deleted_at IS NULL ORDER BY position')
    .all<DrawerRow>();
  return c.json(rows.results.map(rowToDrawerDto));
});

drawerRoutes.patch('/:id', async (c) => {
  const parsed = await parseBody(c, PatchDrawerBodySchema);
  if (!parsed.ok) return parsed.res;

  const row = await c.env.DB
    .prepare('UPDATE drawers SET name = ?1 WHERE id = ?2 AND deleted_at IS NULL RETURNING id, name, position')
    .bind(parsed.data.name, c.req.param('id'))
    .first<DrawerRow>();
  if (!row) return apiError(c, 404, 'not_found', 'Drawer not found');
  return c.json(rowToDrawerDto(row));
});

drawerRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const moveTo = c.req.query('moveTo');

  const [target, activeCount] = await Promise.all([
    db.prepare('SELECT 1 AS ok FROM drawers WHERE id = ?1 AND deleted_at IS NULL').bind(id).first(),
    db.prepare('SELECT COUNT(*) AS n FROM drawers WHERE deleted_at IS NULL').first<{ n: number }>(),
  ]);
  if (!target) return apiError(c, 404, 'not_found', 'Drawer not found');
  if ((activeCount?.n ?? 0) <= 1) {
    return apiError(c, 409, 'last_drawer', 'The last drawer cannot be deleted');
  }

  const items = await db
    .prepare('SELECT COUNT(*) AS n FROM items WHERE drawer_id = ?1 AND deleted_at IS NULL')
    .bind(id)
    .first<{ n: number }>();
  const hasItems = (items?.n ?? 0) > 0;

  if (moveTo !== undefined) {
    const dest =
      moveTo === id
        ? null
        : await db
            .prepare('SELECT 1 AS ok FROM drawers WHERE id = ?1 AND deleted_at IS NULL')
            .bind(moveTo)
            .first();
    if (!dest) {
      return apiError(c, 400, 'validation_failed', 'moveTo must be another active drawer', [
        { path: 'moveTo', message: 'Must be another active drawer' },
      ]);
    }
  } else if (hasItems) {
    return apiError(c, 400, 'validation_failed', 'moveTo is required when the drawer has items', [
      { path: 'moveTo', message: 'Required when the drawer has items' },
    ]);
  }

  const now = new Date().toISOString();
  const statements = [];
  if (moveTo !== undefined) {
    statements.push(
      db
        .prepare(
          `UPDATE items SET drawer_id = ?1, updated_by = ?2, updated_at = ?3
           WHERE drawer_id = ?4 AND deleted_at IS NULL`,
        )
        .bind(moveTo, c.var.email, now, id),
    );
  }
  statements.push(
    db.prepare('UPDATE drawers SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL').bind(now, id),
  );
  await db.batch(statements);
  return c.body(null, 204);
});
