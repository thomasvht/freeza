import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDrawer, createItem } from './fixtures';
import { api } from './helpers';

const send = (method: string, path: string, body?: unknown) =>
  api(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const SEEDS = ['drawer-1', 'drawer-2', 'drawer-3'];

/** Only the 3 seeded drawers active, in their original order. */
beforeEach(async () => {
  const now = new Date().toISOString();
  await env.DB
    .prepare("UPDATE drawers SET deleted_at = ?1 WHERE id NOT LIKE 'drawer-_' AND deleted_at IS NULL")
    .bind(now)
    .run();
  await env.DB.prepare("UPDATE drawers SET deleted_at = NULL, name = 'Drawer ' || substr(id, 8), position = CAST(substr(id, 8) AS INTEGER) WHERE id LIKE 'drawer-_'").run();
});

const activeDrawers = async () => {
  const res = await api('/api/inventory');
  return ((await res.json()) as { drawers: { id: string; name: string; position: number }[] }).drawers;
};

describe('POST /api/drawers', () => {
  it('creates a drawer at max position + 1 with a server-generated id', async () => {
    const res = await send('POST', '/api/drawers', { name: '  Garage ' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string; position: number };
    expect(body).toMatchObject({ name: 'Garage', position: 4 });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await activeDrawers()).map((d) => d.id)).toEqual([...SEEDS, body.id]);
  });

  it('409 drawer_limit on the 11th active drawer', async () => {
    for (let i = 0; i < 7; i++) {
      expect((await send('POST', '/api/drawers', { name: `D${i}` })).status).toBe(201);
    }
    expect(await activeDrawers()).toHaveLength(10);
    const res = await send('POST', '/api/drawers', { name: 'Eleven' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'drawer_limit' } });
    expect(await activeDrawers()).toHaveLength(10);
  });

  it('deleted drawers do not count towards the limit', async () => {
    for (let i = 0; i < 7; i++) await send('POST', '/api/drawers', { name: `D${i}` });
    const [, , , extra] = await activeDrawers();
    expect((await send('DELETE', `/api/drawers/${extra!.id}`)).status).toBe(204);
    expect((await send('POST', '/api/drawers', { name: 'Again' })).status).toBe(201);
  });

  it('400 on an empty or too long name', async () => {
    expect((await send('POST', '/api/drawers', { name: '   ' })).status).toBe(400);
    expect((await send('POST', '/api/drawers', { name: 'x'.repeat(31) })).status).toBe(400);
  });
});

describe('PATCH /api/drawers/:id', () => {
  it('renames a drawer', async () => {
    const res = await send('PATCH', '/api/drawers/drawer-2', { name: ' Chest ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'drawer-2', name: 'Chest', position: 2 });
  });

  it('404 on an unknown or deleted drawer', async () => {
    expect((await send('PATCH', '/api/drawers/nope', { name: 'X' })).status).toBe(404);
    const deleted = await createDrawer(true);
    expect((await send('PATCH', `/api/drawers/${deleted}`, { name: 'X' })).status).toBe(404);
  });

  it('400 on an invalid name', async () => {
    expect((await send('PATCH', '/api/drawers/drawer-1', { name: '' })).status).toBe(400);
  });
});

describe('PUT /api/drawers/order', () => {
  it('rewrites positions 1..n', async () => {
    const res = await send('PUT', '/api/drawers/order', { ids: ['drawer-3', 'drawer-1', 'drawer-2'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: 'drawer-3', name: 'Drawer 3', position: 1 },
      { id: 'drawer-1', name: 'Drawer 1', position: 2 },
      { id: 'drawer-2', name: 'Drawer 2', position: 3 },
    ]);
    expect((await activeDrawers()).map((d) => d.id)).toEqual(['drawer-3', 'drawer-1', 'drawer-2']);
  });

  it.each([
    ['a missing id', ['drawer-1', 'drawer-2']],
    ['a duplicate id', ['drawer-1', 'drawer-1', 'drawer-2']],
    ['an unknown id', ['drawer-1', 'drawer-2', 'nope']],
    ['an extra id', ['drawer-1', 'drawer-2', 'drawer-3', 'nope']],
  ])('400 on %s', async (_name, ids) => {
    const res = await send('PUT', '/api/drawers/order', { ids });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'validation_failed' } });
  });

  it('400 on a deleted drawer id', async () => {
    const deleted = await createDrawer(true);
    const res = await send('PUT', '/api/drawers/order', { ids: [...SEEDS, deleted] });
    expect(res.status).toBe(400);
  });

  it('leaves positions untouched after a rejected order', async () => {
    await send('PUT', '/api/drawers/order', { ids: ['drawer-1'] });
    expect((await activeDrawers()).map((d) => d.id)).toEqual(SEEDS);
  });
});

describe('DELETE /api/drawers/:id', () => {
  it('soft-deletes an empty drawer without moveTo', async () => {
    await env.DB.prepare('UPDATE items SET deleted_at = ?1 WHERE drawer_id = ?2 AND deleted_at IS NULL').bind('2026-01-01T00:00:00.000Z', 'drawer-3').run();
    const res = await send('DELETE', '/api/drawers/drawer-3');
    expect(res.status).toBe(204);
    expect((await activeDrawers()).map((d) => d.id)).toEqual(['drawer-1', 'drawer-2']);
    const row = await env.DB.prepare('SELECT deleted_at FROM drawers WHERE id = ?1').bind('drawer-3').first<{ deleted_at: string | null }>();
    expect(row?.deleted_at).not.toBeNull();
  });

  it('204 without moveTo when the drawer holds only soft-deleted items', async () => {
    const item = await createItem({ drawerId: 'drawer-3' });
    await env.DB.prepare('UPDATE items SET deleted_at = ?1 WHERE id = ?2').bind('2026-01-01T00:00:00.000Z', item.id).run();
    await env.DB.prepare('UPDATE items SET deleted_at = ?1 WHERE drawer_id = ?2 AND deleted_at IS NULL').bind('2026-01-01T00:00:00.000Z', 'drawer-3').run();
    expect((await send('DELETE', '/api/drawers/drawer-3')).status).toBe(204);
  });

  it('400 when moveTo is empty', async () => {
    await createItem({ drawerId: 'drawer-3' });
    const res = await send('DELETE', '/api/drawers/drawer-3?moveTo=');
    expect(res.status).toBe(400);
    expect(await activeDrawers()).toHaveLength(3);
  });

  it('400 validation_failed when the drawer has items and no moveTo', async () => {
    const item = await createItem({ drawerId: 'drawer-3' });
    const res = await send('DELETE', '/api/drawers/drawer-3');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'validation_failed' } });
    expect(await activeDrawers()).toHaveLength(3);
    const row = await env.DB.prepare('SELECT drawer_id FROM items WHERE id = ?1').bind(item.id).first<{ drawer_id: string }>();
    expect(row?.drawer_id).toBe('drawer-3');
  });

  it('moves active items, stamps them and deletes the drawer', async () => {
    const item = await createItem({ drawerId: 'drawer-3' });
    await env.DB.prepare("UPDATE items SET updated_by = 'old@example.com', updated_at = '2020-01-01T00:00:00.000Z' WHERE id = ?1").bind(item.id).run();
    const res = await send('DELETE', '/api/drawers/drawer-3?moveTo=drawer-1');
    expect(res.status).toBe(204);
    expect((await activeDrawers()).map((d) => d.id)).toEqual(['drawer-1', 'drawer-2']);
    const row = await env.DB
      .prepare('SELECT drawer_id, updated_by, updated_at FROM items WHERE id = ?1')
      .bind(item.id)
      .first<{ drawer_id: string; updated_by: string; updated_at: string }>();
    expect(row?.drawer_id).toBe('drawer-1');
    expect(row?.updated_by).toBe('thomas@example.com');
    expect(row!.updated_at > '2020-01-01').toBe(true);
  });

  it('400 when moveTo is the drawer itself', async () => {
    await createItem({ drawerId: 'drawer-3' });
    const res = await send('DELETE', '/api/drawers/drawer-3?moveTo=drawer-3');
    expect(res.status).toBe(400);
    expect(await activeDrawers()).toHaveLength(3);
  });

  it('400 when moveTo is a deleted or unknown drawer', async () => {
    await createItem({ drawerId: 'drawer-3' });
    const deleted = await createDrawer(true);
    expect((await send('DELETE', `/api/drawers/drawer-3?moveTo=${deleted}`)).status).toBe(400);
    expect((await send('DELETE', '/api/drawers/drawer-3?moveTo=nope')).status).toBe(400);
    expect(await activeDrawers()).toHaveLength(3);
  });

  it('404 on an unknown or already deleted drawer', async () => {
    expect((await send('DELETE', '/api/drawers/nope')).status).toBe(404);
    const deleted = await createDrawer(true);
    expect((await send('DELETE', `/api/drawers/${deleted}`)).status).toBe(404);
  });

  it('409 last_drawer for the only remaining drawer, even with a bad moveTo', async () => {
    await send('DELETE', '/api/drawers/drawer-2?moveTo=drawer-1');
    await send('DELETE', '/api/drawers/drawer-3?moveTo=drawer-1');
    const res = await send('DELETE', '/api/drawers/drawer-1?moveTo=nope');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'last_drawer' } });
    expect(await activeDrawers()).toHaveLength(1);
  });
});
