import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { FoodCategory } from '../../models/food-item';

@Component({
  selector: 'app-filter-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './filter-section.component.html',
  styleUrls: ['./filter-section.component.scss'],
})
export class FilterSectionComponent {
  filterForm = input.required<FormGroup>();
  categories = input.required<any[]>();

  getSearchControl(): FormControl<string> {
    return this.filterForm().get('searchTerm') as FormControl<string>;
  }

  getCategoryControl(): FormControl<FoodCategory | null> {
    return this.filterForm().get('selectedCategory') as FormControl<FoodCategory | null>;
  }
}
