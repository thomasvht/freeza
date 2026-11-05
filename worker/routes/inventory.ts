import { Hono } from 'hono';
import type { InventoryResponse, SuggestionDto } from '../../shared/api-types';
import type { CategoryKey } from '../../shared/categories';
import type { PackUnit, Unit } from '../../shared/units';
import {
  rowToDrawerDto,
  rowToItemDto,
  rowToMemberDto,
  type DrawerRow,
  type ItemRow,
  type MemberRow,
} from '../db';
import type { AppEnv } from '../env';
import { apiError } from '../errors';

interface SuggestionRow {
  name: string;
  category: string;
  drawer_id: string;
  unit: string;
  pack_size: number | null;
  pack_unit: string | null;
}

export const inventoryRoutes = new Hono<AppEnv>();

inventoryRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const [drawers, items, members, suggestions] = await db.batch([
    db.prepare('SELECT id, name, position FROM drawers WHERE deleted_at IS NULL ORDER BY position'),
    db.prepare(
      'SELECT * FROM items WHERE deleted_at IS NULL ORDER BY best_before, name COLLATE NOCASE, id',
    ),
    db.prepare('SELECT email, display_name FROM members ORDER BY email'),
    db.prepare(
      `SELECT name, category, drawer_id, unit, pack_size, pack_unit FROM (
         SELECT *, ROW_NUMBER() OVER (
           PARTITION BY lower(name) ORDER BY updated_at DESC, id
         ) AS rn FROM items
       ) WHERE rn = 1 ORDER BY name COLLATE NOCASE LIMIT 200`,
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
    suggestions: (suggestions.results as unknown as SuggestionRow[]).map(
      (r): SuggestionDto => ({
        name: r.name,
        category: r.category as CategoryKey,
        drawerId: r.drawer_id,
        unit: r.unit as Unit,
        packSize: r.pack_size,
        packUnit: r.pack_unit as PackUnit | null,
      }),
    ),
    serverTime: new Date().toISOString(),
  };
  return c.json(body);
});
