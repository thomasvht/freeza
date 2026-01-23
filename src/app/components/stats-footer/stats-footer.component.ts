import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { ExpiryStatus } from '../../models/food-item';
import { FoodItem } from '../../models/food-item';

@Component({
  selector: 'app-stats-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stats-footer.component.html',
  styleUrls: ['./stats-footer.component.scss'],
})
export class StatsFooterComponent {
  items = input.required<FoodItem[]>();

  // Computed signals for memoized counts
  expiringCount = computed(() => {
    return this.items().filter(foodItem => this.getExpiryStatus(foodItem.expiryDate) === ExpiryStatus.EXPIRING_SOON).length;
  });

  expiredCount = computed(() => {
    return this.items().filter(foodItem => this.getExpiryStatus(foodItem.expiryDate) === ExpiryStatus.EXPIRED).length;
  });

  private getExpiryStatus(expiryDate: Date): ExpiryStatus {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) return ExpiryStatus.EXPIRED;
    if (daysUntil <= 3) return ExpiryStatus.EXPIRING_SOON;
    return ExpiryStatus.FRESH;
  }
}
