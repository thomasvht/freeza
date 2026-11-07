export type CategoryKey =
  | 'meat'
  | 'poultry'
  | 'fish'
  | 'veg'
  | 'bread'
  | 'dairy'
  | 'prepared'
  | 'other';

export interface Category {
  readonly key: CategoryKey;
  readonly label: string;
  readonly colorToken: string;
  readonly shelfLifeMonths: number;
}

export const CATEGORIES: readonly Category[] = [
  { key: 'meat', label: 'Meat', colorToken: '--cat-meat', shelfLifeMonths: 6 },
  { key: 'poultry', label: 'Poultry', colorToken: '--cat-poultry', shelfLifeMonths: 9 },
  { key: 'fish', label: 'Fish', colorToken: '--cat-fish', shelfLifeMonths: 4 },
  { key: 'veg', label: 'Vegetables & fruit', colorToken: '--cat-veg', shelfLifeMonths: 10 },
  { key: 'bread', label: 'Bread & baked', colorToken: '--cat-bread', shelfLifeMonths: 3 },
  { key: 'dairy', label: 'Dairy', colorToken: '--cat-dairy', shelfLifeMonths: 4 },
  { key: 'prepared', label: 'Prepared meals', colorToken: '--cat-prepared', shelfLifeMonths: 3 },
  { key: 'other', label: 'Other', colorToken: '--cat-other', shelfLifeMonths: 6 },
];

export const CATEGORY_KEYS: readonly CategoryKey[] = CATEGORIES.map((c) => c.key);
