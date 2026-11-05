import { describe, expect, it } from 'vitest';
import {
  CreateItemBodySchema,
  TakeBodySchema,
  RestoreBodySchema,
  RecipesResponseSchema,
  checkItemRules,
} from './api-types';

const valid = {
  id: '3f2b8c1e-6a4d-4e0b-9d57-0c1f2a3b4c5d',
  name: 'Peas',
  category: 'veg',
  drawerId: '4f2b8c1e-6a4d-4e0b-9d57-0c1f2a3b4c5d',
  quantity: 2,
  unit: 'kg',
  packSize: null,
  packUnit: null,
  frozenOn: '2026-11-01',
  bestBefore: '2027-05-01',
  bestBeforeManual: false,
  notes: null,
};

describe('CreateItemBodySchema', () => {
  it('accepts a valid kg item', () => {
    expect(CreateItemBodySchema.safeParse(valid).success).toBe(true);
  });
  it('rejects packSize with unit kg', () => {
    expect(CreateItemBodySchema.safeParse({ ...valid, packSize: 500, packUnit: 'g' }).success).toBe(false);
  });
  it('accepts packSize with counted unit', () => {
    expect(
      CreateItemBodySchema.safeParse({ ...valid, unit: 'bag', quantity: 2, packSize: 500, packUnit: 'g' }).success,
    ).toBe(true);
  });
  it('rejects packSize without packUnit', () => {
    expect(CreateItemBodySchema.safeParse({ ...valid, unit: 'bag', packSize: 500 }).success).toBe(false);
  });
  it('rejects non-integer quantity for counted units', () => {
    expect(CreateItemBodySchema.safeParse({ ...valid, unit: 'bag', quantity: 1.5 }).success).toBe(false);
  });
  it('rejects quantity 0', () => {
    expect(CreateItemBodySchema.safeParse({ ...valid, quantity: 0 }).success).toBe(false);
  });
  it('rejects bestBefore before frozenOn', () => {
    expect(CreateItemBodySchema.safeParse({ ...valid, bestBefore: '2026-10-31' }).success).toBe(false);
  });
  it('trims name', () => {
    const r = CreateItemBodySchema.safeParse({ ...valid, name: '  Peas  ' });
    expect(r.success && r.data.name).toBe('Peas');
  });
  it('rejects empty-after-trim name', () => {
    expect(CreateItemBodySchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });
  it('rejects 61-char name, accepts 60', () => {
    expect(CreateItemBodySchema.safeParse({ ...valid, name: 'a'.repeat(61) }).success).toBe(false);
    expect(CreateItemBodySchema.safeParse({ ...valid, name: 'a'.repeat(60) }).success).toBe(true);
  });
  it('rejects 201-char note, accepts 200', () => {
    expect(CreateItemBodySchema.safeParse({ ...valid, notes: 'a'.repeat(201) }).success).toBe(false);
    expect(CreateItemBodySchema.safeParse({ ...valid, notes: 'a'.repeat(200) }).success).toBe(true);
  });
  it('turns blank notes into null', () => {
    const r = CreateItemBodySchema.safeParse({ ...valid, notes: '   ' });
    expect(r.success && r.data.notes).toBeNull();
  });
  it('rejects unknown category', () => {
    expect(CreateItemBodySchema.safeParse({ ...valid, category: 'candy' }).success).toBe(false);
  });
  it('rejects malformed and non-existent dates', () => {
    expect(CreateItemBodySchema.safeParse({ ...valid, frozenOn: '2026-2-1' }).success).toBe(false);
    expect(CreateItemBodySchema.safeParse({ ...valid, frozenOn: '2026-02-30' }).success).toBe(false);
  });
  it('rejects non-uuid id', () => {
    expect(CreateItemBodySchema.safeParse({ ...valid, id: 'nope' }).success).toBe(false);
  });
});

describe('checkItemRules', () => {
  it('returns empty for valid item', () => {
    expect(checkItemRules(valid as never)).toEqual([]);
  });
  it('reports path and message', () => {
    const issues = checkItemRules({ ...valid, bestBefore: '2026-10-01' } as never);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe('bestBefore');
  });
});

describe('TakeBodySchema / RestoreBodySchema', () => {
  it('rejects 0 and negatives', () => {
    expect(TakeBodySchema.safeParse({ amount: 0 }).success).toBe(false);
    expect(TakeBodySchema.safeParse({ amount: -1 }).success).toBe(false);
  });
  it('accepts missing and positive amount', () => {
    expect(TakeBodySchema.safeParse({}).success).toBe(true);
    expect(TakeBodySchema.safeParse({ amount: 0.5 }).success).toBe(true);
  });
  it('restore rejects 0', () => {
    expect(RestoreBodySchema.safeParse({ quantity: 0 }).success).toBe(false);
  });
});

describe('RecipesResponseSchema', () => {
  const recipe = { name: 'Soup', minutes: 30, uses: [{ name: 'Peas', itemId: null, status: null }], alsoNeed: [], method: 'Boil.' };
  it('requires exactly 3 recipes', () => {
    expect(RecipesResponseSchema.safeParse({ recipes: [recipe, recipe] }).success).toBe(false);
    expect(RecipesResponseSchema.safeParse({ recipes: [recipe, recipe, recipe] }).success).toBe(true);
  });
});
