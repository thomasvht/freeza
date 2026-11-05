import { Hono } from 'hono';
import {
  RecipesBodySchema,
  RecipesResponseSchema,
  type RecipesResponse,
} from '../../shared/api-types';
import { expiryStatus } from '../../shared/expiry';
import { rowToItemDto, type ItemRow } from '../db';
import type { AppEnv } from '../env';
import { apiError } from '../errors';
import { parseBody } from '../http';
import {
  buildRecipePrompt,
  ModelRecipesSchema,
  RECIPE_DAILY_CAP,
  RECIPE_JSON_SCHEMA,
  RECIPE_MODEL,
} from '../recipes/prompt';

// Unverified: Workers AI types/docs in node_modules document no error code or text for the daily allowance.
const LIMIT_ERROR = /neuron|allocation|quota|limit/i;

class AiLimitError extends Error {}

export const recipeRoutes = new Hono<AppEnv>();

recipeRoutes.post('/', async (c) => {
  const parsed = await parseBody(c, RecipesBodySchema);
  if (!parsed.ok) return parsed.res;
  const { today, preference } = parsed.data;

  const rows = await c.env.DB
    .prepare('SELECT * FROM items WHERE deleted_at IS NULL ORDER BY best_before, name COLLATE NOCASE, id')
    .all<ItemRow>();
  const items = rows.results.map(rowToItemDto);
  if (items.length === 0) return apiError(c, 400, 'empty_freezer', 'The freezer is empty');

  // Increment before calling the model, so failed calls count too.
  const usage = await c.env.DB
    .prepare(
      `INSERT INTO ai_usage (day, count) VALUES (?1, 1)
       ON CONFLICT(day) DO UPDATE SET count = count + 1 RETURNING count`,
    )
    .bind(new Date().toISOString().slice(0, 10))
    .first<{ count: number }>();
  if ((usage?.count ?? 0) > RECIPE_DAILY_CAP) {
    return apiError(c, 429, 'ai_limit', 'Daily recipe limit reached');
  }

  const { messages } = buildRecipePrompt(items, today, preference);
  const byName = new Map(items.map((i) => [i.name.toLowerCase(), i]));

  const attempt = async (): Promise<RecipesResponse | null> => {
    let result: unknown;
    try {
      result = await (c.env.AI as unknown as {
        run: (model: string, input: unknown) => Promise<{ response?: unknown }>;
      }).run(RECIPE_MODEL, {
        messages,
        response_format: { type: 'json_schema', json_schema: RECIPE_JSON_SCHEMA },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Workers AI error:', message);
      if (LIMIT_ERROR.test(message)) throw new AiLimitError(message);
      return null;
    }
    let response = (result as { response?: unknown } | null)?.response;
    if (typeof response === 'string') {
      try {
        response = JSON.parse(response);
      } catch {
        return null;
      }
    }
    const model = ModelRecipesSchema.safeParse(response);
    if (!model.success) return null;
    const mapped = {
      recipes: model.data.recipes.map((r) => ({
        ...r,
        uses: r.uses.map((name) => {
          const item = byName.get(name.trim().toLowerCase());
          return item
            ? { name, itemId: item.id, status: expiryStatus(item.bestBefore, today) }
            : { name, itemId: null, status: null };
        }),
      })),
    };
    const final = RecipesResponseSchema.safeParse(mapped);
    return final.success ? final.data : null;
  };

  try {
    const out = (await attempt()) ?? (await attempt());
    if (out) return c.json(out);
  } catch (err) {
    if (err instanceof AiLimitError) return apiError(c, 429, 'ai_limit', 'Daily recipe limit reached');
    throw err;
  }
  return apiError(c, 502, 'recipes_failed', "Couldn't think of recipes, try again");
});
