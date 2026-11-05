import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  checkItemRules,
  CreateItemBodySchema,
  PatchItemBodySchema,
  RestoreBodySchema,
  TakeBodySchema,
} from '../../shared/api-types';
import { isCountedUnit } from '../../shared/units';
import type { Unit } from '../../shared/units';
import { rowToItemDto, type ItemRow } from '../db';
import type { AppEnv } from '../env';
import { apiError } from '../errors';
import { parseBody } from '../http';

type Ctx = Context<AppEnv>;

const notFound = (c: Ctx) => apiError(c, 404, 'not_found', 'Item not found');

function getRow(c: Ctx, id: string): Promise<ItemRow | null> {
  return c.env.DB.prepare('SELECT * FROM items WHERE id = ?1').bind(id).first<ItemRow>();
}

async function drawerIsActive(c: Ctx, id: string): Promise<boolean> {
  const row = await c.env.DB
    .prepare('SELECT 1 AS ok FROM drawers WHERE id = ?1 AND deleted_at IS NULL')
    .bind(id)
    .first();
  return row !== null;
}

export const itemRoutes = new Hono<AppEnv>();

itemRoutes.post('/', async (c) => {
  const parsed = await parseBody(c, CreateItemBodySchema);
  if (!parsed.ok) return parsed.res;
  const b = parsed.data;

  if (!(await drawerIsActive(c, b.drawerId))) {
    return apiError(c, 400, 'validation_failed', 'Drawer does not exist', [
      { path: 'drawerId', message: 'Unknown or deleted drawer' },
    ]);
  }
  if (await getRow(c, b.id)) return apiError(c, 409, 'conflict', 'Item id already exists');

  const now = new Date().toISOString();
  const email = c.var.email;
  try {
    await c.env.DB
      .prepare(
        `INSERT INTO items (id, name, category, drawer_id, quantity, unit, pack_size, pack_unit,
           frozen_on, best_before, best_before_manual, notes, created_by, updated_by, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13, ?14, ?14)`,
      )
      .bind(
        b.id, b.name, b.category, b.drawerId, b.quantity, b.unit, b.packSize, b.packUnit,
        b.frozenOn, b.bestBefore, b.bestBeforeManual ? 1 : 0, b.notes, email, now,
      )
      .run();
  } catch (err) {
    // Lost a race with a concurrent create of the same id.
    if (String(err).includes('UNIQUE')) return apiError(c, 409, 'conflict', 'Item id already exists');
    throw err;
  }
  const row = await getRow(c, b.id);
  return c.json(rowToItemDto(row!), 201);
});

itemRoutes.patch('/:id', async (c) => {
  const parsed = await parseBody(c, PatchItemBodySchema);
  if (!parsed.ok) return parsed.res;
  const p = parsed.data;

  const row = await getRow(c, c.req.param('id'));
  if (!row || row.deleted_at !== null) return notFound(c);
  const cur = rowToItemDto(row);
  const merged = {
    ...cur,
    ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)),
  } as typeof cur;

  const issues = checkItemRules(merged);
  if (issues.length > 0) {
    return apiError(c, 400, 'validation_failed', 'Validation failed', issues);
  }
  if (p.drawerId !== undefined && !(await drawerIsActive(c, p.drawerId))) {
    return apiError(c, 400, 'validation_failed', 'Drawer does not exist', [
      { path: 'drawerId', message: 'Unknown or deleted drawer' },
    ]);
  }

  // Only write the columns present in the patch, so a concurrent take on quantity is not overwritten.
  const COLUMNS: Record<string, string> = {
    name: 'name', category: 'category', drawerId: 'drawer_id', quantity: 'quantity', unit: 'unit',
    packSize: 'pack_size', packUnit: 'pack_unit', frozenOn: 'frozen_on', bestBefore: 'best_before',
    bestBeforeManual: 'best_before_manual', notes: 'notes',
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(p)) {
    if (value === undefined) continue;
    values.push(key === 'bestBeforeManual' ? (value ? 1 : 0) : value);
    sets.push(`${COLUMNS[key]} = ?${values.length}`);
  }
  values.push(c.var.email, new Date().toISOString(), cur.id);
  const n = values.length;
  sets.push(`updated_by = ?${n - 2}`, `updated_at = ?${n - 1}`);
  const res = await c.env.DB
    .prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?${n} AND deleted_at IS NULL RETURNING *`)
    .bind(...values)
    .first<ItemRow>();
  if (!res) return notFound(c);
  return c.json(rowToItemDto(res));
});

itemRoutes.post('/:id/take', async (c) => {
  const parsed = await parseBody(c, TakeBodySchema, true);
  if (!parsed.ok) return parsed.res;
  const amount = parsed.data.amount ?? 1;

  const row = await getRow(c, c.req.param('id'));
  if (!row || row.deleted_at !== null) return notFound(c);
  if (isCountedUnit(row.unit as Unit) && !Number.isInteger(amount)) {
    return apiError(c, 400, 'validation_failed', 'Amount must be a whole number for counted units', [
      { path: 'amount', message: 'Amount must be a whole number for counted units' },
    ]);
  }

  const res = await c.env.DB
    .prepare(
      `UPDATE items
       SET quantity   = max(round(quantity - ?1, 6), 0),
           deleted_at = CASE WHEN round(quantity - ?1, 6) <= 0 THEN ?2 ELSE deleted_at END,
           updated_by = ?3, updated_at = ?2
       WHERE id = ?4 AND deleted_at IS NULL
       RETURNING *`,
    )
    .bind(amount, new Date().toISOString(), c.var.email, row.id)
    .first<ItemRow>();
  if (!res) return notFound(c);
  const item = rowToItemDto(res);
  return c.json(res.deleted_at !== null ? { deleted: true, item } : { item });
});

itemRoutes.delete('/:id', async (c) => {
  const now = new Date().toISOString();
  const res = await c.env.DB
    .prepare(
      `UPDATE items SET deleted_at = ?1, updated_by = ?2, updated_at = ?1
       WHERE id = ?3 AND deleted_at IS NULL RETURNING id`,
    )
    .bind(now, c.var.email, c.req.param('id'))
    .first();
  if (!res) return notFound(c);
  return c.body(null, 204);
});

itemRoutes.post('/:id/restore', async (c) => {
  const parsed = await parseBody(c, RestoreBodySchema, true);
  if (!parsed.ok) return parsed.res;

  const row = await getRow(c, c.req.param('id'));
  if (!row) return notFound(c);
  if (row.deleted_at === null) return c.json(rowToItemDto(row)); // idempotent

  const quantity = parsed.data.quantity ?? row.quantity;
  if (quantity <= 0) {
    return apiError(c, 400, 'validation_failed', 'Quantity is required to restore this item', [
      { path: 'quantity', message: 'Quantity must be greater than 0' },
    ]);
  }
  if (isCountedUnit(row.unit as Unit) && !Number.isInteger(quantity)) {
    return apiError(c, 400, 'validation_failed', 'Quantity must be a whole number for counted units', [
      { path: 'quantity', message: 'Quantity must be a whole number for counted units' },
    ]);
  }
  if (!(await drawerIsActive(c, row.drawer_id))) {
    return apiError(c, 409, 'drawer_gone', 'The drawer of this item was deleted');
  }

  const res = await c.env.DB
    .prepare(
      `UPDATE items SET deleted_at = NULL, quantity = ?1, updated_by = ?2, updated_at = ?3
       WHERE id = ?4 AND deleted_at IS NOT NULL RETURNING *`,
    )
    .bind(quantity, c.var.email, new Date().toISOString(), row.id)
    .first<ItemRow>();
  // No row: someone restored it in between; return the current state (idempotent).
  return c.json(rowToItemDto(res ?? (await getRow(c, row.id))!));
});
