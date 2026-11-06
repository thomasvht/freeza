import { describe, expect, it } from 'vitest';
import { addMonths, daysBetween, todayLocal } from './dates';

describe('todayLocal', () => {
  it('uses local date components, not UTC', () => {
    expect(todayLocal(new Date(2026, 10, 5, 23, 30))).toBe('2026-11-05');
    expect(todayLocal(new Date(2026, 10, 5, 0, 30))).toBe('2026-11-05');
  });
});

describe('addMonths', () => {
  it('clamps to the end of the month', () => {
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
  });
  it('handles negative months', () => {
    expect(addMonths('2026-01-31', -2)).toBe('2025-11-30');
  });
  it('keeps the day when it exists', () => {
    expect(addMonths('2026-11-05', 3)).toBe('2027-02-05');
  });
});

describe('daysBetween', () => {
  it('counts days', () => {
    expect(daysBetween('2026-11-05', '2026-11-19')).toBe(14);
  });
  it('is not shifted by DST', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });
});
