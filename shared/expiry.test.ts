import { describe, expect, it } from 'vitest';
import { expiryStatus, suggestBestBefore } from './expiry';

describe('expiryStatus', () => {
  const today = '2026-11-05';
  it.each([
    ['2026-11-04', 'expired'],
    ['2026-11-05', 'use-soon'],
    ['2026-11-19', 'use-soon'],
    ['2026-11-20', 'fresh'],
  ])('%s is %s', (bestBefore, status) => {
    expect(expiryStatus(bestBefore, today)).toBe(status);
  });
});

describe('suggestBestBefore', () => {
  it('adds the category shelf life', () => {
    expect(suggestBestBefore('2026-11-05', 'meat')).toBe('2027-05-05');
    expect(suggestBestBefore('2026-11-05', 'bread')).toBe('2027-02-05');
  });
});
