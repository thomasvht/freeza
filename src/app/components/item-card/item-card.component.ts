import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FoodItem, ExpiryStatus, FOOD_CATEGORIES } from '../../models/food-item';

@Component({
  selector: 'app-item-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  templateUrl: './item-card.component.html',
  styleUrls: ['./item-card.component.scss'],
})
export class ItemCardComponent {
  item = input.required<FoodItem>();
  expiryStatus = input.required<ExpiryStatus>();
  daysUntilExpiry = input.required<number>();

  edit = output<void>();
  delete = output<void>();

  ExpiryStatus = ExpiryStatus;
  FOOD_CATEGORIES = FOOD_CATEGORIES;

  // Computed signal for category color - memoized
  categoryColor = computed(() => FOOD_CATEGORIES[this.item().category].color);
}
