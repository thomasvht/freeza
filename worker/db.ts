import type { DrawerDto, ItemDto, MemberDto } from '../shared/api-types';
import type { CategoryKey } from '../shared/categories';
import type { PackUnit, Unit } from '../shared/units';

export interface ItemRow {
  id: string;
  name: string;
  category: string;
  drawer_id: string;
  quantity: number;
  unit: string;
  pack_size: number | null;
  pack_unit: string | null;
  frozen_on: string;
  best_before: string;
  best_before_manual: number;
  notes: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DrawerRow {
  id: string;
  name: string;
  position: number;
}

export interface MemberRow {
  email: string;
  display_name: string;
}

export function rowToItemDto(row: ItemRow): ItemDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category as CategoryKey,
    drawerId: row.drawer_id,
    quantity: row.quantity,
    unit: row.unit as Unit,
    packSize: row.pack_size,
    packUnit: row.pack_unit as PackUnit | null,
    frozenOn: row.frozen_on,
    bestBefore: row.best_before,
    bestBeforeManual: row.best_before_manual === 1,
    notes: row.notes,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToDrawerDto(row: DrawerRow): DrawerDto {
  return { id: row.id, name: row.name, position: row.position };
}

export function rowToMemberDto(row: MemberRow): MemberDto {
  return { email: row.email, displayName: row.display_name };
}
