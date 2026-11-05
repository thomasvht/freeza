import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { DrawerDto } from '@shared/api-types';
import type { ItemView } from '../../../core/inventory.store';
import { ItemCardComponent } from '../item-card/item-card';

@Component({
  selector: 'app-drawer-group',
  imports: [ItemCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <h2 class="t-label">
        {{ drawer().name }} <span class="count">{{ items().length }}</span>
      </h2>
      <ul class="list" role="list">
        @for (item of items(); track item.id) {
          <li><app-item-card [item]="item" (open)="open.emit($event)" (take)="take.emit($event)" /></li>
        }
      </ul>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    h2 {
      margin-bottom: 8px;
    }

    .list {
      display: grid;
      gap: 8px;
      list-style: none;
    }
  `,
})
export class DrawerGroup {
  readonly drawer = input.required<DrawerDto>();
  readonly items = input.required<ItemView[]>();
  readonly open = output<ItemView>();
  readonly take = output<ItemView>();
}
