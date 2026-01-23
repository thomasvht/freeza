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

export function getExpiryStatus(expiryDate: Date): ExpiryStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  
  const daysUntilExpiry = Math.floor(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry < 0) return ExpiryStatus.EXPIRED;
  if (daysUntilExpiry <= 7) return ExpiryStatus.EXPIRING_SOON;
  return ExpiryStatus.FRESH;
}
