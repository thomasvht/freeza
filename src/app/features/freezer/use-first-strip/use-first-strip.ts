import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { formatDaysLeft } from '../../../core/format';
import type { ItemView } from '../../../core/inventory.store';
import { S } from '../../../strings';

@Component({
  selector: 'app-use-first-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length > 0) {
      <section aria-labelledby="use-first">
        <h2 id="use-first" class="t-label">
          {{ label }} <span class="count">{{ items().length }}</span>
        </h2>
        <div class="row">
          @for (item of items(); track item.id) {
            <button type="button" class="tile" [class]="'tile ' + item.status" (click)="open.emit(item)">
              <span class="name t-item">{{ item.name }}</span>
              <span class="when">{{ daysLeft(item) }}</span>
            </button>
          }
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    h2 {
      margin-bottom: 8px;
    }

    .row {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
      scrollbar-width: none;
    }

    .tile {
      display: grid;
      flex: none;
      gap: 2px;
      min-width: 120px;
      max-width: 180px;
      min-height: 44px;
      padding: 8px 12px;
      border-radius: 14px;
      text-align: left;
      color: var(--soon);
      background: color-mix(in srgb, var(--soon) 14%, var(--glass-fallback));

      &.expired {
        color: var(--expired);
        background: color-mix(in srgb, var(--expired) 14%, var(--glass-fallback));
      }
    }

    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .when {
      font-size: 12px;
      font-weight: 600;
    }
  `,
})
export class UseFirstStrip {
  readonly items = input.required<ItemView[]>();
  readonly open = output<ItemView>();

  protected readonly label = S.freezer.useFirst;
  protected daysLeft(item: ItemView): string {
    return formatDaysLeft(item.daysLeft);
  }
}
