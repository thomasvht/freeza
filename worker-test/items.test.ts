import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createDrawer, createItem, json, newItem, staleDrawerCheck } from './fixtures';
import { api } from './helpers';

const send = (method: string, path: string, body?: unknown) =>
  api(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe('POST /api/items', () => {
  it('sets createdBy and updatedBy to the caller', async () => {
    const body = newItem();
    const res = await api('/api/items', json(body));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      id: body.id,
      createdBy: 'thomas@example.com',
      updatedBy: 'thomas@example.com',
      bestBefore: '2027-01-01',
      bestBeforeManual: false,
    });
  });

  it('409 conflict on an existing id', async () => {
    const body = await createItem();
    const res = await api('/api/items', json(body));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'conflict' } });
  });

  it('400 on unknown drawer', async () => {
    const res = await api('/api/items', json(newItem({ drawerId: 'nope' })));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'validation_failed' } });
  });

  it('400 on deleted drawer', async () => {
    const res = await api('/api/items', json(newItem({ drawerId: await createDrawer(true) })));
    expect(res.status).toBe(400);
  });

  it('400 and no row when the drawer is deleted right after the check', async () => {
    const drawerId = await createDrawer(true);
    const body = newItem({ drawerId });
    const res = await api('/api/items', json(body), { DB: staleDrawerCheck(env.DB, drawerId) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'validation_failed' } });
    expect(await env.DB.prepare('SELECT 1 FROM items WHERE id = ?1').bind(body.id).first()).toBeNull();
  });

  it('400 on invalid JSON', async () => {
    const res = await api('/api/items', { method: 'POST', body: '{nope' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/items/:id', () => {
  it('keeps bestBefore when the category changes', async () => {
    const item = await createItem();
    const res = await send('PATCH', `/api/items/${item.id}`, { category: 'meat' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ category: 'meat', bestBefore: '2027-01-01' });
  });

  it('404 on a soft-deleted item', async () => {
    const item = await createItem();
    await send('DELETE', `/api/items/${item.id}`);
    const res = await send('PATCH', `/api/items/${item.id}`, { notes: 'x' });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('runs cross-field rules on the merged item', async () => {
    const item = await createItem();
    const res = await send('PATCH', `/api/items/${item.id}`, { bestBefore: '2026-09-01' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: 'validation_failed', details: [{ path: 'bestBefore' }] },
    });
  });

  it('400 when moving to an inactive drawer', async () => {
    const item = await createItem();
    const res = await send('PATCH', `/api/items/${item.id}`, { drawerId: await createDrawer(true) });
    expect(res.status).toBe(400);
  });

  it('400 and no move when the drawer is deleted right after the check', async () => {
    const item = await createItem();
    const drawerId = await createDrawer(true);
    const res = await api(
      `/api/items/${item.id}`,
      { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ drawerId }) },
      { DB: staleDrawerCheck(env.DB, drawerId) },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'validation_failed' } });
    const row = await env.DB.prepare('SELECT drawer_id FROM items WHERE id = ?1').bind(item.id).first<{ drawer_id: string }>();
    expect(row?.drawer_id).toBe('drawer-1');
  });

  it('moves to an active drawer', async () => {
    const item = await createItem();
    const res = await send('PATCH', `/api/items/${item.id}`, { drawerId: 'drawer-2' });
    expect(await res.json()).toMatchObject({ drawerId: 'drawer-2' });
  });
});

describe('POST /api/items/:id/take', () => {
  it('decrements, then deletes at zero', async () => {
    const item = await createItem({ quantity: 3 });
    const first = await send('POST', `/api/items/${item.id}/take`, {});
    expect(await first.json()).toMatchObject({ item: { quantity: 2 } });

    const one = await createItem({ quantity: 1 });
    const res = await send('POST', `/api/items/${one.id}/take`, { amount: 1 });
    expect(await res.json()).toMatchObject({ deleted: true, item: { quantity: 0 } });
    const gone = await send('DELETE', `/api/items/${one.id}`);
    expect(gone.status).toBe(404);
  });

  it('two concurrent takes on 2 bags both succeed and delete the item', async () => {
    const item = await createItem({ quantity: 2 });
    const [a, b] = await Promise.all([
      send('POST', `/api/items/${item.id}/take`, { amount: 1 }),
      send('POST', `/api/items/${item.id}/take`, { amount: 1 }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const row = await env.DB.prepare('SELECT quantity, deleted_at FROM items WHERE id = ?1')
      .bind(item.id)
      .first<{ quantity: number; deleted_at: string | null }>();
    expect(row?.quantity).toBe(0);
    expect(row?.deleted_at).not.toBeNull();
  });

  it('taking 1 from 0.8 kg deletes with quantity 0', async () => {
    const item = await createItem({ quantity: 0.8, unit: 'kg' });
    const res = await send('POST', `/api/items/${item.id}/take`, { amount: 1 });
    expect(await res.json()).toMatchObject({ deleted: true, item: { quantity: 0 } });
  });

  it('400 on a fractional amount for a counted unit', async () => {
    const item = await createItem();
    const res = await send('POST', `/api/items/${item.id}/take`, { amount: 1.5 });
    expect(res.status).toBe(400);
  });

  it('404 on a soft-deleted item', async () => {
    const item = await createItem();
    await send('DELETE', `/api/items/${item.id}`);
    const res = await send('POST', `/api/items/${item.id}/take`, {});
    expect(res.status).toBe(404);
  });
});

describe('hardening', () => {
  it('PATCH without quantity keeps a quantity changed by a take', async () => {
    const item = await createItem({ quantity: 3 });
    await send('POST', `/api/items/${item.id}/take`, {});
    const res = await send('PATCH', `/api/items/${item.id}`, { notes: 'hello' });
    expect(await res.json()).toMatchObject({ quantity: 2, notes: 'hello' });
  });

  it('take rounds float residue', async () => {
    const a = await createItem({ quantity: 1.2, unit: 'kg' });
    const r1 = await send('POST', `/api/items/${a.id}/take`, { amount: 0.4 });
    expect(await r1.json()).toMatchObject({ item: { quantity: 0.8 } });
    const b = await createItem({ quantity: 1.2, unit: 'kg' });
    const r2 = await send('POST', `/api/items/${b.id}/take`, { amount: 0.5 });
    expect(await r2.json()).toMatchObject({ item: { quantity: 0.7 } });
  });

  it('take of a stored 0.30000000000000004 by 0.3 deletes', async () => {
    const item = await createItem({ quantity: 1, unit: 'kg' });
    await env.DB.prepare('UPDATE items SET quantity = 0.30000000000000004 WHERE id = ?1').bind(item.id).run();
    const res = await send('POST', `/api/items/${item.id}/take`, { amount: 0.3 });
    expect(await res.json()).toMatchObject({ deleted: true, item: { quantity: 0 } });
  });

  it('PATCH invalid JSON is 400', async () => {
    const item = await createItem();
    expect((await api(`/api/items/${item.id}`, { method: 'PATCH', body: '{nope' })).status).toBe(400);
  });

  it('PATCH and take on unknown id are 404', async () => {
    const id = crypto.randomUUID();
    expect((await send('PATCH', `/api/items/${id}`, { notes: 'x' })).status).toBe(404);
    expect((await send('POST', `/api/items/${id}/take`, {})).status).toBe(404);
  });

  it('create with bestBefore before frozenOn is 400', async () => {
    const res = await api('/api/items', json(newItem({ frozenOn: '2026-10-01', bestBefore: '2026-09-01' })));
    expect(res.status).toBe(400);
  });
});

describe('DELETE and restore', () => {
  it('delete then restore keeps the quantity', async () => {
    const item = await createItem({ quantity: 3 });
    expect((await send('DELETE', `/api/items/${item.id}`)).status).toBe(204);
    const res = await send('POST', `/api/items/${item.id}/restore`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ quantity: 3 });
  });

  it('restore with quantity after a take to zero', async () => {
    const item = await createItem({ quantity: 1 });
    await send('POST', `/api/items/${item.id}/take`, {});
    const res = await send('POST', `/api/items/${item.id}/restore`, { quantity: 1 });
    expect(await res.json()).toMatchObject({ quantity: 1, id: item.id });
  });

  it('400 restoring a zero-quantity item without quantity', async () => {
    const item = await createItem({ quantity: 1 });
    await send('POST', `/api/items/${item.id}/take`, {});
    expect((await send('POST', `/api/items/${item.id}/restore`)).status).toBe(400);
  });

  it('409 drawer_gone when the drawer was deleted', async () => {
    const drawerId = await createDrawer();
    const item = await createItem({ drawerId });
    await send('DELETE', `/api/items/${item.id}`);
    await env.DB.prepare('UPDATE drawers SET deleted_at = ?1 WHERE id = ?2')
      .bind(new Date().toISOString(), drawerId)
      .run();
    const res = await send('POST', `/api/items/${item.id}/restore`);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'drawer_gone' } });
  });

  it('restore of an active item is idempotent', async () => {
    const item = await createItem();
    const res = await send('POST', `/api/items/${item.id}/restore`);
    expect(res.status).toBe(200);
  });

  it('404 for unknown id on restore and delete', async () => {
    const id = crypto.randomUUID();
    expect((await send('POST', `/api/items/${id}/restore`)).status).toBe(404);
    expect((await send('DELETE', `/api/items/${id}`)).status).toBe(404);
  });
});
