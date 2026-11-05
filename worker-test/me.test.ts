import { describe, expect, it } from 'vitest';
import { api } from './helpers';

const patch = (body: unknown) =>
  api('/api/me', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const inventory = async () =>
  (await (await api('/api/inventory')).json()) as {
    me: { email: string; displayName: string };
    members: { email: string; displayName: string }[];
  };

describe('PATCH /api/me', () => {
  it('trims and stores the display name', async () => {
    const res = await patch({ displayName: '  Kim ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'thomas@example.com', displayName: 'Kim' });
    expect((await inventory()).me.displayName).toBe('Kim');
  });

  it('updates only the caller row', async () => {
    const before = (await inventory()).members.filter((m) => m.email !== 'thomas@example.com');
    await patch({ displayName: 'Solo' });
    const after = (await inventory()).members.filter((m) => m.email !== 'thomas@example.com');
    expect(after).toEqual(before);
  });

  it('400 on a 31 character name', async () => {
    const res = await patch({ displayName: 'x'.repeat(31) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'validation_failed' } });
  });

  it('400 on an empty name or invalid JSON', async () => {
    expect((await patch({ displayName: '   ' })).status).toBe(400);
    const res = await api('/api/me', { method: 'PATCH', body: 'nope' });
    expect(res.status).toBe(400);
  });
});
