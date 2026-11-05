import { InjectionToken } from '@angular/core';
import type { ItemDto } from '@shared/api-types';
import type { ItemView } from '../../core/inventory.store';

/** Add/edit sheet. Task 9 provides the real one; until then opening it does nothing. */
export interface ItemSheetOpener {
  open(item?: ItemDto): void;
}

/** Take-out sheet for measured units. Task 9 provides the real one. */
export interface TakeOutSheetOpener {
  open(item: ItemView): void;
}

export const ITEM_SHEET = new InjectionToken<ItemSheetOpener>('ITEM_SHEET', {
  factory: () => ({ open: () => undefined }),
});

export const TAKE_OUT_SHEET = new InjectionToken<TakeOutSheetOpener>('TAKE_OUT_SHEET', {
  factory: () => ({ open: () => undefined }),
});
