import { Hono } from 'hono';
import type { InventoryResponse } from '../../shared/api-types';
import {
  rowToDrawerDto,
  rowToItemDto,
  rowToMemberDto,
  rowToSuggestionDto,
  type DrawerRow,
  type ItemRow,
  type MemberRow,
  type SuggestionRow,
} from '../db';
import type { AppEnv } from '../env';
import { apiError } from '../errors';

export const inventoryRoutes = new Hono<AppEnv>();

inventoryRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const [drawers, items, members, suggestions] = await db.batch([
    db.prepare('SELECT id, name, position FROM drawers WHERE deleted_at IS NULL ORDER BY position'),
    db.prepare(
      'SELECT * FROM items WHERE deleted_at IS NULL ORDER BY best_before, name COLLATE NOCASE, id',
    ),
    db.prepare('SELECT email, display_name FROM members ORDER BY email'),
    // lower() folds ASCII only (accepted). Cap keeps the 200 most recently updated names.
    db.prepare(
      `SELECT name, category, drawer_id, unit, pack_size, pack_unit FROM (
         SELECT name, category, drawer_id, unit, pack_size, pack_unit, updated_at FROM (
           SELECT *, ROW_NUMBER() OVER (
             PARTITION BY lower(name) ORDER BY updated_at DESC, id
           ) AS rn FROM items
         ) WHERE rn = 1 ORDER BY updated_at DESC LIMIT 200
       ) ORDER BY name COLLATE NOCASE`,
    ),
  ]);

  const memberRows = members.results as unknown as MemberRow[];
  const me = memberRows.find((m) => m.email === c.var.email);
  if (!me) return apiError(c, 500, 'internal', 'Member row missing');

  const body: InventoryResponse = {
    drawers: (drawers.results as unknown as DrawerRow[]).map(rowToDrawerDto),
    items: (items.results as unknown as ItemRow[]).map(rowToItemDto),
    members: memberRows.map(rowToMemberDto),
    me: rowToMemberDto(me),
    suggestions: (suggestions.results as unknown as SuggestionRow[]).map(rowToSuggestionDto),
    serverTime: new Date().toISOString(),
  };
  return c.json(body);
});
