// Item rules shared by the app and the Worker. No zod here: the app imports this file, and zod would
// add about 500 kB to its initial bundle.
import type { IsoDate } from './dates';
import { isCountedUnit } from './units';
import type { PackUnit, Unit } from './units';

export const ITEM_NAME_MAX = 60;
export const ITEM_NOTES_MAX = 200;
export const PREFERENCE_MAX = 100;
export const DRAWER_NAME_MAX = 30;
export const DISPLAY_NAME_MAX = 30;
export const MAX_ACTIVE_DRAWERS = 10;

/** Quantities and pack sizes: finite and above 0. */
export function isPositiveNumber(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

export const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` that is also a real calendar date. */
export function isIsoDate(s: string): boolean {
  const m = ISO_DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export interface ItemRuleInput {
  unit: Unit;
  packSize: number | null;
  packUnit: PackUnit | null;
  frozenOn: IsoDate;
  bestBefore: IsoDate;
  quantity: number;
}

export interface ItemRuleIssue {
  path: string;
  message: string;
}

/** Cross-field rules for a complete item. Empty array means valid. Reused by the Worker on merged PATCH results. */
export function checkItemRules(item: ItemRuleInput): ItemRuleIssue[] {
  const issues: ItemRuleIssue[] = [];
  const counted = isCountedUnit(item.unit);

  if ((item.packSize === null) !== (item.packUnit === null)) {
    issues.push({ path: 'packSize', message: 'packSize and packUnit must be set together' });
  }
  if (!counted && (item.packSize !== null || item.packUnit !== null)) {
    issues.push({
      path: 'packSize',
      message: 'packSize and packUnit are only allowed with counted units',
    });
  }
  if (counted && !Number.isInteger(item.quantity)) {
    issues.push({ path: 'quantity', message: 'Quantity must be a whole number for counted units' });
  }
  if (item.bestBefore < item.frozenOn) {
    issues.push({ path: 'bestBefore', message: 'bestBefore must not be before frozenOn' });
  }
  return issues;
}
