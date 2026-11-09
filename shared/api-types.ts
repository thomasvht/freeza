import { z } from 'zod';
import { CATEGORY_KEYS } from './categories';
import type { CategoryKey } from './categories';
import { PACK_UNITS, UNITS } from './units';
import type { PackUnit, Unit } from './units';
import {
  checkItemRules,
  ISO_DATE_RE,
  isIsoDate,
  isPositiveNumber,
  ITEM_NAME_MAX,
  ITEM_NOTES_MAX,
  DISPLAY_NAME_MAX,
  DRAWER_NAME_MAX,
  PREFERENCE_MAX,
} from './item-rules';
import type { ItemRuleInput, ItemRuleIssue } from './item-rules';

// ---------- primitives ----------

/** `YYYY-MM-DD` that is also a real calendar date. */
export const IsoDateSchema = z
  .string()
  .regex(ISO_DATE_RE, 'Expected YYYY-MM-DD')
  .refine(isIsoDate, 'Not a real calendar date');

const trimmed = (max: number) => z.string().trim().min(1).max(max);

/** Trimmed free text; blank after trim becomes null. */
const NotesSchema = z
  .string()
  .trim()
  .max(ITEM_NOTES_MAX)
  .transform((s) => (s === '' ? null : s))
  .nullable();

const CategorySchema = z.enum(CATEGORY_KEYS as [CategoryKey, ...CategoryKey[]]);
const UnitSchema = z.enum(UNITS as [Unit, ...Unit[]]);
const PackUnitSchema = z.enum(PACK_UNITS as [PackUnit, ...PackUnit[]]);
const QuantitySchema = z.number().refine(isPositiveNumber, 'Must be a positive number');
const PackSizeSchema = z.number().refine(isPositiveNumber, 'Must be a positive number');
const ExpiryStatusSchema = z.enum(['expired', 'use-soon', 'fresh']);

// ---------- cross-field item rules ----------

export { checkItemRules };
export type { ItemRuleInput, ItemRuleIssue };

// ---------- DTOs ----------

export const ItemDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: CategorySchema,
  drawerId: z.string(),
  quantity: z.number(),
  unit: UnitSchema,
  packSize: z.number().nullable(),
  packUnit: PackUnitSchema.nullable(),
  frozenOn: IsoDateSchema,
  bestBefore: IsoDateSchema,
  bestBeforeManual: z.boolean(),
  notes: z.string().nullable(),
  createdBy: z.string(),
  updatedBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ItemDto = z.infer<typeof ItemDtoSchema>;

export const DrawerDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().int(),
});
export type DrawerDto = z.infer<typeof DrawerDtoSchema>;

export const MemberDtoSchema = z.object({
  email: z.string(),
  displayName: z.string(),
});
export type MemberDto = z.infer<typeof MemberDtoSchema>;

export const SuggestionDtoSchema = z.object({
  name: z.string(),
  category: CategorySchema,
  drawerId: z.string(),
  unit: UnitSchema,
  packSize: z.number().nullable(),
  packUnit: PackUnitSchema.nullable(),
});
export type SuggestionDto = z.infer<typeof SuggestionDtoSchema>;

export const InventoryResponseSchema = z.object({
  drawers: z.array(DrawerDtoSchema),
  items: z.array(ItemDtoSchema),
  members: z.array(MemberDtoSchema),
  me: MemberDtoSchema,
  suggestions: z.array(SuggestionDtoSchema),
  serverTime: z.string(),
});
export type InventoryResponse = z.infer<typeof InventoryResponseSchema>;

// ---------- request bodies ----------

export const CreateItemBodySchema = z
  .object({
    id: z.uuid(),
    name: trimmed(ITEM_NAME_MAX),
    category: CategorySchema,
    drawerId: z.string().min(1),
    quantity: QuantitySchema,
    unit: UnitSchema,
    packSize: PackSizeSchema.nullable(),
    packUnit: PackUnitSchema.nullable(),
    frozenOn: IsoDateSchema,
    bestBefore: IsoDateSchema,
    bestBeforeManual: z.boolean(),
    notes: NotesSchema,
  })
  .superRefine((item, ctx) => {
    for (const issue of checkItemRules(item)) {
      ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
    }
  });
export type CreateItemBody = z.infer<typeof CreateItemBodySchema>;

/** Partial: cross-field rules need the merged item, so the Worker runs `checkItemRules` after merging. */
export const PatchItemBodySchema = z.object({
  name: trimmed(ITEM_NAME_MAX).optional(),
  category: CategorySchema.optional(),
  drawerId: z.string().min(1).optional(),
  quantity: QuantitySchema.optional(),
  unit: UnitSchema.optional(),
  packSize: PackSizeSchema.nullable().optional(),
  packUnit: PackUnitSchema.nullable().optional(),
  frozenOn: IsoDateSchema.optional(),
  bestBefore: IsoDateSchema.optional(),
  bestBeforeManual: z.boolean().optional(),
  notes: NotesSchema.optional(),
});
export type PatchItemBody = z.infer<typeof PatchItemBodySchema>;

export const TakeBodySchema = z.object({ amount: QuantitySchema.optional() });
export type TakeBody = z.infer<typeof TakeBodySchema>;

export const RestoreBodySchema = z.object({ quantity: QuantitySchema.optional() });
export type RestoreBody = z.infer<typeof RestoreBodySchema>;

export const CreateDrawerBodySchema = z.object({ name: trimmed(DRAWER_NAME_MAX) });
export type CreateDrawerBody = z.infer<typeof CreateDrawerBodySchema>;

export const PatchDrawerBodySchema = z.object({ name: trimmed(DRAWER_NAME_MAX) });
export type PatchDrawerBody = z.infer<typeof PatchDrawerBodySchema>;

export const DrawerOrderBodySchema = z.object({ ids: z.array(z.string().min(1)) });
export type DrawerOrderBody = z.infer<typeof DrawerOrderBodySchema>;

export const PatchMeBodySchema = z.object({ displayName: trimmed(DISPLAY_NAME_MAX) });
export type PatchMeBody = z.infer<typeof PatchMeBodySchema>;

export const RecipesBodySchema = z.object({
  preference: z.string().trim().max(PREFERENCE_MAX).optional(),
  today: IsoDateSchema,
});
export type RecipesBody = z.infer<typeof RecipesBodySchema>;

// ---------- recipes ----------

export const RecipeSchema = z.object({
  name: z.string(),
  minutes: z.number(),
  uses: z.array(
    z.object({
      name: z.string(),
      itemId: z.string().nullable(),
      status: ExpiryStatusSchema.nullable(),
    }),
  ),
  alsoNeed: z.array(z.string()),
  method: z.string(),
});
export type Recipe = z.infer<typeof RecipeSchema>;

/** Recipes per response; shared by the response schema, the model schema and the JSON schema. */
export const RECIPE_COUNT = 3;

export const RecipesResponseSchema = z.object({
  recipes: z.array(RecipeSchema).length(RECIPE_COUNT),
});
export type RecipesResponse = z.infer<typeof RecipesResponseSchema>;

// ---------- errors ----------

export type ApiErrorCode =
  | 'validation_failed'
  | 'not_found'
  | 'conflict'
  | 'unauthorized'
  | 'forbidden'
  | 'drawer_limit'
  | 'last_drawer'
  | 'drawer_gone'
  | 'ai_limit'
  | 'empty_freezer'
  | 'recipes_failed'
  | 'internal';

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
