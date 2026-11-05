import { env } from 'cloudflare:workers';
import { api } from './helpers';

export const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export function newItem(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    name: 'Peas',
    category: 'veg',
    drawerId: 'drawer-1',
    quantity: 3,
    unit: 'bag',
    packSize: null,
    packUnit: null,
    frozenOn: '2026-10-01',
    bestBefore: '2027-01-01',
    bestBeforeManual: false,
    notes: null,
    ...overrides,
  };
}

export async function createItem(overrides: Record<string, unknown> = {}) {
  const body = newItem(overrides);
  const res = await api('/api/items', json(body));
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${await res.text()}`);
  return body;
}

export async function createDrawer(deleted = false): Promise<string> {
  const id = `drawer-${crypto.randomUUID()}`;
  await env.DB
    .prepare('INSERT INTO drawers (id, name, position, created_at, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(id, 'Test', 100, new Date().toISOString(), deleted ? new Date().toISOString() : null)
    .run();
  return id;
}
