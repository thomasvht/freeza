import { describe, expect, it } from 'vitest';
import { isCountedUnit } from './units';

describe('isCountedUnit', () => {
  it('is true for counted units', () => {
    expect(isCountedUnit('bag')).toBe(true);
  });
  it('is false for measured units', () => {
    expect(isCountedUnit('kg')).toBe(false);
  });
});
