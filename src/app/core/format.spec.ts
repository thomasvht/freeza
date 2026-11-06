import type { ItemDto } from '@shared/api-types';
import {
  formatDate,
  formatDaysLeft,
  formatNumber,
  formatQuantity,
  formatShortDate,
  formatTimestampDate,
} from './format';

function item(over: Partial<ItemDto>): ItemDto {
  return {
    id: 'i1',
    name: 'Minced beef',
    category: 'meat',
    drawerId: 'drawer-1',
    quantity: 1,
    unit: 'piece',
    packSize: null,
    packUnit: null,
    frozenOn: '2026-11-01',
    bestBefore: '2027-05-01',
    bestBeforeManual: false,
    notes: null,
    createdBy: 'a@example.com',
    updatedBy: 'a@example.com',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...over,
  };
}

describe('format', () => {
  it('formats dates as dd/MM/yyyy and dd/MM', () => {
    expect(formatDate('2026-11-05')).toBe('05/11/2026');
    expect(formatShortDate('2026-11-05')).toBe('05/11');
  });

  it('formats a timestamp as its local calendar date', () => {
    const local = new Date(2026, 10, 3, 23, 30); // 03/11/2026 23:30 in the local zone
    expect(formatTimestampDate(local.toISOString())).toBe('03/11/2026');
  });

  it('formats numbers with a decimal comma and at most 3 decimals', () => {
    expect(formatNumber(0.5)).toBe('0,5');
    expect(formatNumber(0.125)).toBe('0,125');
    expect(formatNumber(1.2345)).toBe('1,235');
  });

  it('formats quantities', () => {
    expect(formatQuantity(item({ quantity: 2, unit: 'bag', packSize: 500, packUnit: 'g' }))).toBe(
      '2 × 500 g',
    );
    expect(formatQuantity(item({ quantity: 0.8, unit: 'kg' }))).toBe('0,8 kg');
    expect(formatQuantity(item({ quantity: 6, unit: 'piece' }))).toBe('6 pieces');
  });

  it('formats days left', () => {
    expect(formatDaysLeft(-1)).toBe('Expired');
    expect(formatDaysLeft(0)).toBe('Today');
    expect(formatDaysLeft(4)).toBe('4 days');
    expect(formatDaysLeft(59)).toBe('59 days');
    expect(formatDaysLeft(60)).toBe('2 months');
    expect(formatDaysLeft(95)).toBe('3 months');
  });
});
