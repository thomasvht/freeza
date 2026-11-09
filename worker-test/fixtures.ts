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

/**
 * A DB whose first "is drawer `id` active?" check answers yes, whatever the table says. Simulates the
 * drawer being deleted by the other phone right after that check, so only a guard in the write
 * statement itself can stop the write.
 */
export function staleDrawerCheck(db: D1Database, id: string): D1Database {
  let used = false;
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql: string) => {
          const stmt = target.prepare(sql);
          if (!/^SELECT 1 AS ok FROM drawers WHERE id = \?1 AND deleted_at IS NULL$/.test(sql)) return stmt;
          return {
            bind: (...args: unknown[]) => {
              if (used || args[0] !== id) return stmt.bind(...args);
              used = true;
              return { first: async () => ({ ok: 1 }) };
            },
          };
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
