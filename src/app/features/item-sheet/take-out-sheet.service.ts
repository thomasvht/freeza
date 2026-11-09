import { computed, Injectable, signal } from '@angular/core';
import type { ItemView } from '../../core/inventory.store';
import type { TakeOutSheetOpener } from './sheet.tokens';

/** Which measured item the take-out sheet shows. */
@Injectable({ providedIn: 'root' })
export class TakeOutSheetService implements TakeOutSheetOpener {
  private readonly _item = signal<ItemView | null>(null);
  readonly item = this._item.asReadonly();
  readonly isOpen = computed(() => this._item() !== null);

  open(item: ItemView): void {
    this._item.set(item);
  }

  close(): void {
    this._item.set(null);
  }
}
