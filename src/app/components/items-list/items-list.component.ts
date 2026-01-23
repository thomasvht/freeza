import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { ItemCardComponent } from '../item-card/item-card.component';
import { FoodItem, ExpiryStatus } from '../../models/food-item';

@Component({
  selector: 'app-items-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ItemCardComponent],
  templateUrl: './items-list.component.html',
  styleUrls: ['./items-list.component.scss'],
})
export class ItemsListComponent {
  items = input.required<FoodItem[]>();

  itemEdit = output<FoodItem>();
  itemDelete = output<string>();

  ExpiryStatus = ExpiryStatus;

  // Computed signal for items count - memoized
  itemsCount = computed(() => this.items().length);

  getExpiryStatus(expiryDate: Date): ExpiryStatus {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) return ExpiryStatus.EXPIRED;
    if (daysUntil <= 3) return ExpiryStatus.EXPIRING_SOON;
    return ExpiryStatus.FRESH;
  }

  getDaysUntilExpiry(expiryDate: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }
}
