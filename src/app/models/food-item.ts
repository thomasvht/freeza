import { EXPIRY_CONSTANTS } from '../constants/app.constants';
import { normalizeToMidnight, calculateDaysDifference } from '../utils/date.utils';

export interface FoodItem {
  id: string;
  name: string;
  category: FoodCategory;
  quantity: number;
  unit: string;
  storageDate: Date;
  expiryDate: Date;
  notes?: string;
}

export type FoodCategory = 'meat' | 'vegetables' | 'dairy' | 'prepared' | 'other';

export const FOOD_CATEGORIES: Record<FoodCategory, { label: string; color: string }> = {
  meat: { label: 'Meat', color: '#ef4444' },
  vegetables: { label: 'Vegetables', color: '#22c55e' },
  dairy: { label: 'Dairy', color: '#f59e0b' },
  prepared: { label: 'Prepared Meals', color: '#8b5cf6' },
  other: { label: 'Other', color: '#6b7280' },
};

export enum ExpiryStatus {
  EXPIRED = 'expired',
  EXPIRING_SOON = 'expiring-soon',
  FRESH = 'fresh',
}

/**
 * Determines the expiry status of a food item
 * @param expiryDate - The expiration date to check
 * @returns ExpiryStatus enum value indicating the item's freshness status
 */
export function getExpiryStatus(expiryDate: Date): ExpiryStatus {
  const today = normalizeToMidnight(new Date());
  const expiry = normalizeToMidnight(expiryDate);
  const daysUntilExpiry = calculateDaysDifference(today, expiry);

  if (daysUntilExpiry < 0) return ExpiryStatus.EXPIRED;
  if (daysUntilExpiry <= EXPIRY_CONSTANTS.EXPIRING_SOON_THRESHOLD_DAYS)
    return ExpiryStatus.EXPIRING_SOON;
  return ExpiryStatus.FRESH;
}
