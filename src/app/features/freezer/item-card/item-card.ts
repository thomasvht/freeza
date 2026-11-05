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
  protected readonly meta = computed(
    () => `${formatQuantity(this.item())} · ${formatDate(this.item().bestBefore)}`,
  );
  protected readonly daysLeft = computed(() => formatDaysLeft(this.item().daysLeft));
  protected readonly takeLabel = computed(() => fill(S.freezer.takeOne, { name: this.item().name }));
}
