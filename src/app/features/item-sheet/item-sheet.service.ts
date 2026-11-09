import { computed, Injectable, signal } from '@angular/core';
import type { ItemDto } from '@shared/api-types';
import type { ItemSheetOpener } from './sheet.tokens';

/** Which item the add/edit sheet shows. The sheet itself renders once, in the app shell. */
@Injectable({ providedIn: 'root' })
export class ItemSheetService implements ItemSheetOpener {
  private readonly _state = signal<{ item?: ItemDto } | null>(null);
  readonly isOpen = computed(() => this._state() !== null);
  /** The item being edited; undefined when adding. */
  readonly item = computed(() => this._state()?.item);

  open(item?: ItemDto): void {
    this._state.set({ item });
  }

  close(): void {
    this._state.set(null);
  }
}
