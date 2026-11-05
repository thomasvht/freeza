import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RECIPE_DAILY_CAP, RECIPE_MODEL, buildRecipePrompt } from '../worker/recipes/prompt';
import type { ItemDto } from '../shared/api-types';
import { createItem, json } from './fixtures';
import { aiRun, api } from './helpers';

const TODAY = '2026-11-05';
const utcDay = () => new Date().toISOString().slice(0, 10);
const post = (body: unknown = { today: TODAY }) => api('/api/recipes', json(body));

const recipe = (name: string, uses: string[] = ['Peas']) => ({
  name,
  minutes: 20,
  uses,
  alsoNeed: ['salt'],
  method: 'Cook it. Eat it.',
});
const valid = (uses: string[] = ['Peas']) => ({
  recipes: [recipe('A', uses), recipe('B'), recipe('C')],
});

const usageCount = async () =>
  (await env.DB.prepare('SELECT count FROM ai_usage WHERE day = ?1').bind(utcDay()).first<{ count: number }>())
    ?.count ?? 0;

beforeEach(async () => {
  aiRun.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await env.DB.prepare('DELETE FROM ai_usage').run();
  await env.DB
    .prepare('UPDATE items SET deleted_at = ?1 WHERE deleted_at IS NULL')
    .bind(new Date().toISOString())
    .run();
  await createItem({ name: 'Minced beef', category: 'meat', bestBefore: '2026-11-09', unit: 'g', quantity: 500 });
  await createItem({ name: 'Peas', bestBefore: '2027-06-01' });
});

describe('POST /api/recipes', () => {
  it('returns 3 recipes with uses matched case-insensitively to items', async () => {
    aiRun.mockResolvedValue({ response: valid(['minced BEEF', 'Unicorn']) });
    const res = await post();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recipes: { uses: unknown[] }[] };
    expect(body.recipes).toHaveLength(3);
    expect(body.recipes[0]!.uses).toEqual([
      { name: 'minced BEEF', itemId: expect.stringMatching(/^[0-9a-f-]{36}$/), status: 'use-soon' },
      { name: 'Unicorn', itemId: null, status: null },
    ]);
    expect(aiRun).toHaveBeenCalledWith(
      RECIPE_MODEL,
      expect.objectContaining({ response_format: expect.objectContaining({ type: 'json_schema' }) }),
    );
  });

  it('accepts response as a JSON string', async () => {
    aiRun.mockResolvedValue({ response: JSON.stringify(valid(['Peas'])) });
    const res = await post();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recipes: { uses: { status: string }[] }[] };
    expect(body.recipes[0]!.uses[0]!.status).toBe('fresh');
  });

  it('sends items expired and use-soon first, preference in the user message only', async () => {
    await createItem({ name: 'Old fish', category: 'fish', bestBefore: '2026-10-01' });
    aiRun.mockResolvedValue({ response: valid() });
    await post({ today: TODAY, preference: '  vegetarian  ' });
    const { messages } = aiRun.mock.calls[0]![1] as { messages: { role: string; content: string }[] };
    expect(messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(messages[0]!.content).not.toContain('vegetarian');
    const user = messages[1]!.content;
    expect(user).toContain('vegetarian');
    expect(user.indexOf('Old fish')).toBeLessThan(user.indexOf('Minced beef'));
    expect(user.indexOf('Minced beef')).toBeLessThan(user.indexOf('Peas'));
    expect(user).toContain('"status":"expired"');
  });

  it('rejects a preference over 100 characters', async () => {
    const res = await post({ today: TODAY, preference: 'a'.repeat(101) });
    expect(res.status).toBe(400);
    expect(aiRun).not.toHaveBeenCalled();
  });

  it('429 ai_limit on the 21st call of the UTC day, without calling AI', async () => {
    await env.DB.prepare('INSERT INTO ai_usage (day, count) VALUES (?1, ?2)').bind(utcDay(), RECIPE_DAILY_CAP).run();
    const res = await post();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: 'ai_limit' } });
    expect(aiRun).not.toHaveBeenCalled();
  });

  it('increments the counter before the AI call', async () => {
    aiRun.mockRejectedValue(new Error('boom'));
    await post();
    expect(await usageCount()).toBe(1);
  });

  it('400 empty_freezer without AI call or counter increment', async () => {
    await env.DB.prepare('UPDATE items SET deleted_at = ?1 WHERE deleted_at IS NULL').bind('2026-11-05T00:00:00.000Z').run();
    const res = await post();
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'empty_freezer' } });
    expect(aiRun).not.toHaveBeenCalled();
    expect(await usageCount()).toBe(0);
  });

  it('retries once when the first response is invalid', async () => {
    aiRun
      .mockResolvedValueOnce({ response: { recipes: [recipe('A'), recipe('B')] } })
      .mockResolvedValueOnce({ response: valid() });
    const res = await post();
    expect(res.status).toBe(200);
    expect(aiRun).toHaveBeenCalledTimes(2);
    expect(await usageCount()).toBe(1);
  });

  it('502 recipes_failed when both responses are invalid', async () => {
    aiRun.mockResolvedValue({ response: 'not json' });
    const res = await post();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: { code: 'recipes_failed' } });
    expect(aiRun).toHaveBeenCalledTimes(2);
  });

  it('retries once on a generic AI error, then 502', async () => {
    aiRun.mockRejectedValue(new Error('JSON Mode couldn\'t be met'));
    const res = await post();
    expect(res.status).toBe(502);
    expect(aiRun).toHaveBeenCalledTimes(2);
  });

  it('429 ai_limit when the AI reports the allowance is used up', async () => {
    aiRun.mockRejectedValue(new Error('4006: you have used up your daily free allocation of 10,000 neurons'));
    const res = await post();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: 'ai_limit' } });
    expect(aiRun).toHaveBeenCalledTimes(1);
  });
});

describe('buildRecipePrompt', () => {
  it('omits packSize/packUnit when unset and includes them when set', () => {
    const base = { id: 'x', category: 'veg', drawerId: 'd', frozenOn: TODAY, bestBeforeManual: false, notes: null, createdBy: '', updatedBy: '', createdAt: '', updatedAt: '' };
    const items = [
      { ...base, name: 'Peas', quantity: 1, unit: 'bag', packSize: 500, packUnit: 'g', bestBefore: '2027-01-01' },
      { ...base, name: 'Beef', quantity: 2, unit: 'g', packSize: null, packUnit: null, bestBefore: '2027-01-02' },
    ] as ItemDto[];
    const user = buildRecipePrompt(items, TODAY).messages[1]!.content;
    expect(user).toContain('"packSize":500');
    expect(user.match(/packSize/g)).toHaveLength(1);
  });
});
