import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CATEGORIES } from '@shared/categories';
import { LucideMinus } from '@lucide/angular';
import { formatDate, formatDaysLeft, formatQuantity } from '../../../core/format';
import type { ItemView } from '../../../core/inventory.store';
import { fill, S } from '../../../strings';

@Component({
  selector: 'app-item-card',
  imports: [LucideMinus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './item-card.html',
  styleUrl: './item-card.scss',
})
export class ItemCardComponent {
  readonly item = input.required<ItemView>();
  readonly open = output<ItemView>();
  readonly take = output<ItemView>();

  protected readonly bar = computed(() => {
    const token = CATEGORIES.find((c) => c.key === this.item().category)?.colorToken;
    return `var(${token ?? '--cat-other'})`;
  });
  protected readonly quantity = computed(() => formatQuantity(this.item()));
  protected readonly bestBefore = computed(() => formatDate(this.item().bestBefore));
  private lastQuantity: number | null = null;
  /** True when the quantity differs from the last one shown, so the number ticks over (DESIGN.md §6.6). */
  protected readonly ticking = computed(() => {
    const q = this.item().quantity;
    const changed = this.lastQuantity !== null && this.lastQuantity !== q;
    this.lastQuantity = q;
    return changed;
  });
  protected readonly daysLeft = computed(() => formatDaysLeft(this.item().daysLeft));
  protected readonly takeLabel = computed(() =>
    fill(S.freezer.takeOne, { name: this.item().name }),
  );
}
