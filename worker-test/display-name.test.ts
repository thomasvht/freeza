import { describe, expect, it } from 'vitest';
import { defaultDisplayName } from '../worker/display-name';

describe('defaultDisplayName', () => {
  it('uses the part before the first dot', () => {
    expect(defaultDisplayName('thomas.vanhoutte@x.be')).toBe('Thomas');
  });
  it('uses the part before @', () => {
    expect(defaultDisplayName('kim@x.be')).toBe('Kim');
  });
  it('capitalises only the first letter', () => {
    expect(defaultDisplayName('aNNa@x.be')).toBe('ANNa');
  });
  it('falls back when the local part is empty', () => {
    expect(defaultDisplayName('.x@y.be')).toBe('Member');
  });
});
