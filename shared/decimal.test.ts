import { describe, expect, it } from 'vitest';
import { parseDecimal } from './decimal';

describe('parseDecimal', () => {
  it('accepts comma decimals', () => expect(parseDecimal('0,5')).toBe(0.5));
  it('accepts dot decimals', () => expect(parseDecimal('1.25')).toBe(1.25));
  it('trims whitespace', () => expect(parseDecimal(' 2 ')).toBe(2));
  it('rejects garbage', () => expect(parseDecimal('abc')).toBeNull());
  it('rejects empty', () => expect(parseDecimal('')).toBeNull());
  it('rejects partial garbage and multiple separators', () => {
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal('2kg')).toBeNull();
    expect(parseDecimal('Infinity')).toBeNull();
  });
});
