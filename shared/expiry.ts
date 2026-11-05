import { CATEGORIES, type CategoryKey } from './categories';
import { addMonths, daysBetween, type IsoDate } from './dates';

export const USE_SOON_DAYS = 14;

export type ExpiryStatus = 'expired' | 'use-soon' | 'fresh';

export function expiryStatus(bestBefore: IsoDate, today: IsoDate): ExpiryStatus {
  const days = daysBetween(today, bestBefore);
  if (days < 0) return 'expired';
  if (days <= USE_SOON_DAYS) return 'use-soon';
  return 'fresh';
}

export function suggestBestBefore(frozenOn: IsoDate, category: CategoryKey): IsoDate {
  const months = CATEGORIES.find((c) => c.key === category)!.shelfLifeMonths;
  return addMonths(frozenOn, months);
}
