import type { ItemDto } from '@shared/api-types';
import type { IsoDate } from '@shared/dates';
import { isCountedUnit, UNIT_LABELS } from '@shared/units';
import { fill, S } from '../strings';

const LOCALE = 'nl-BE';

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortDateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});
const numberFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });

/** Days from which `formatDaysLeft` switches to whole months. */
const MONTHS_FROM_DAYS = 60;
const DAYS_PER_MONTH = 30;

function toUtcDate(d: IsoDate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

/** `dd/MM/yyyy` */
export function formatDate(d: IsoDate): string {
  return dateFormat.format(toUtcDate(d));
}

/** `dd/MM` */
export function formatShortDate(d: IsoDate): string {
  return shortDateFormat.format(toUtcDate(d));
}

/** Decimal comma, at most 2 decimals. */
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

/** "2 × 500 g", "0,8 kg", "6 pieces", "1 piece". */
export function formatQuantity(item: Pick<ItemDto, 'quantity' | 'unit' | 'packSize' | 'packUnit'>): string {
  const qty = formatNumber(item.quantity);
  if (item.packSize !== null && item.packUnit !== null) {
    return `${qty} × ${formatNumber(item.packSize)} ${item.packUnit}`;
  }
  if (isCountedUnit(item.unit) && item.quantity === 1) {
    return `${qty} ${item.unit}`;
  }
  return `${qty} ${UNIT_LABELS[item.unit]}`;
}

/** "Expired", "Today", "4 days", or whole months from 60 days on ("3 months"). */
export function formatDaysLeft(days: number): string {
  if (days < 0) return S.days.expired;
  if (days === 0) return S.days.today;
  if (days === 1) return S.days.oneDay;
  if (days < MONTHS_FROM_DAYS) return fill(S.days.days, { n: days });
  return fill(S.days.months, { n: Math.floor(days / DAYS_PER_MONTH) });
}
