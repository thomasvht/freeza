import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { CATEGORIES } from '@shared/categories';
import { LucideMinus } from '@lucide/angular';
import { ConnectivityService } from '../../../core/connectivity.service';
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
  protected readonly online = inject(ConnectivityService).online;
  readonly item = input.required<ItemView>();
  readonly open = output<ItemView>();
  readonly take = output<ItemView>();

  protected readonly bar = computed(() => {
    const token = CATEGORIES.find((c) => c.key === this.item().category)?.colorToken;
    return `var(${token ?? '--cat-other'})`;
  });
  protected readonly quantity = computed(() => formatQuantity(this.item()));
  protected readonly bestBefore = computed(() => formatDate(this.item().bestBefore));
  private readonly shown = linkedSignal<number, { value: number; changed: boolean }>({
    source: () => this.item().quantity,
    computation: (value, previous) => ({
      value,
      changed: previous !== undefined && previous.source !== value,
    }),
  });
  /** True when the quantity differs from the last one shown, so the number ticks over (DESIGN.md §6.6). */
  protected readonly ticking = computed(() => this.shown().changed);
  protected readonly daysLeft = computed(() => formatDaysLeft(this.item().daysLeft));
  protected readonly takeLabel = computed(() =>
    fill(S.freezer.takeOne, { name: this.item().name }),
  );
}
