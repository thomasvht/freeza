import { describe, expect, it } from 'vitest';
import { InventoryResponseSchema } from '../shared/api-types';
import { createItem } from './fixtures';
import { api } from './helpers';

async function inventory() {
  const res = await api('/api/inventory');
  expect(res.status).toBe(200);
  return InventoryResponseSchema.parse(await res.json());
}

describe('GET /api/inventory', () => {
  it('returns active items ordered by bestBefore, then name', async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const late = await createItem({ name: `${tag} late`, bestBefore: '2028-05-01' });
    const b = await createItem({ name: `${tag} b`, bestBefore: '2028-01-01' });
    const a = await createItem({ name: `${tag} A`, bestBefore: '2028-01-01' });
    const gone = await createItem({ name: `${tag} gone`, bestBefore: '2028-01-01' });
    await api(`/api/items/${gone.id}`, { method: 'DELETE' });

    const inv = await inventory();
    const ids = inv.items.filter((i) => i.name.startsWith(tag)).map((i) => i.id);
    expect(ids).toEqual([a.id, b.id, late.id]);
    expect(inv.items.every((i, n) => n === 0 || inv.items[n - 1]!.bestBefore <= i.bestBefore)).toBe(true);
  });

  it('returns drawers by position, me and members', async () => {
    const inv = await inventory();
    const positions = inv.drawers.map((d) => d.position);
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
    expect(inv.drawers.slice(0, 3).map((d) => d.id)).toEqual(['drawer-1', 'drawer-2', 'drawer-3']);
    expect(inv.me).toEqual({ email: 'thomas@example.com', displayName: 'Thomas' });
    expect(inv.members.some((m) => m.email === 'thomas@example.com')).toBe(true);
    expect(Number.isNaN(Date.parse(inv.serverTime))).toBe(false);
  });

  it('suggests one entry per case-insensitive name with the latest values, incl. deleted', async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    await createItem({ name: `${tag} Soup`, unit: 'box', category: 'prepared', drawerId: 'drawer-1' });
    await new Promise((r) => setTimeout(r, 5));
    await createItem({ name: `${tag} soup`, unit: 'portion', category: 'prepared', drawerId: 'drawer-2' });
    const only = await createItem({ name: `${tag} onlydeleted`, drawerId: 'drawer-3' });
    await api(`/api/items/${only.id}`, { method: 'DELETE' });

    const inv = await inventory();
    const mine = inv.suggestions.filter((s) => s.name.startsWith(tag));
    expect(mine).toHaveLength(2);
    expect(mine.find((s) => s.name.toLowerCase().endsWith('soup'))).toMatchObject({
      name: `${tag} soup`,
      unit: 'portion',
      drawerId: 'drawer-2',
    });
    expect(mine.some((s) => s.name.endsWith('onlydeleted'))).toBe(true);
  });
});
