import { inject, Injectable } from '@angular/core';
import type { ItemDto } from '@shared/api-types';
import { InventoryStore } from '../../core/inventory.store';
import { ToastService } from '../../core/toast.service';
import { fill, S } from '../../strings';

/** The one place that takes units out and offers undo when that removes the last of an item. */
@Injectable({ providedIn: 'root' })
export class TakeOutUndoService {
  private readonly store = inject(InventoryStore);
  private readonly toast = inject(ToastService);

  /** Takes 1 (counted) or `amount` (measured) out. Never rejects: the store has already toasted a failure. */
  async takeOut(item: ItemDto, amount?: number): Promise<void> {
    const before = item.quantity;
    const result = await (
      amount === undefined ? this.store.takeOut(item.id) : this.store.takeOut(item.id, amount)
    ).catch(() => null);
    if (!result?.deleted) return;
    this.toast.show({
      message: fill(S.undo.tookLast, { name: item.name }),
      actionLabel: S.undo.undo,
      action: () => void this.store.restoreItem(item, before).catch(() => undefined),
    });
  }
}
