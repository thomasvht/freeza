import { Component, signal, effect, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FreezerService } from './services/freezer.service';
import { AuthService } from './services/auth.service';
import { FoodItem, FoodCategory, FOOD_CATEGORIES, getExpiryStatus, ExpiryStatus } from './models/food-item';
import { FOOD_FORM_CONSTANTS } from './constants/app.constants';
import { HeaderComponent } from './components/header/header.component';
import { FoodFormComponent } from './components/food-form/food-form.component';
import { FilterSectionComponent } from './components/filter-section/filter-section.component';
import { ItemsListComponent } from './components/items-list/items-list.component';
import { StatsFooterComponent } from './components/stats-footer/stats-footer.component';
import { AuthShellComponent } from './components/auth-shell/auth-shell.component';

interface FilterFormValue {
  searchTerm: string;
  selectedCategory: FoodCategory | null;
}

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HeaderComponent,
    FoodFormComponent,
    FilterSectionComponent,
    ItemsListComponent,
    StatsFooterComponent,
    AuthShellComponent,
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class AppComponent {
  private freezerService = inject(FreezerService);
  authService = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  // Get items directly as signal
  items = this.freezerService.items;
  
  editingId = signal<string | null>(null);
  filterFormValue = signal<FilterFormValue>({ searchTerm: '', selectedCategory: null });
  
  foodForm!: FormGroup;
  filterForm!: FormGroup<{
    searchTerm: FormControl<string>;
    selectedCategory: FormControl<FoodCategory | null>;
  }>;
  categories = Object.entries(FOOD_CATEGORIES).map(([categoryKey, categoryConfig]) => ({ key: categoryKey as FoodCategory, ...categoryConfig }));

  ExpiryStatus = ExpiryStatus;
  FOOD_CATEGORIES = FOOD_CATEGORIES;

  constructor() {
    this.initializeForm();
    this.initializeFilterForm();
    
    effect(() => {
      const formValue = this.filterForm.value as FilterFormValue;
      this.filterFormValue.set(formValue);
    });
  }

  private initializeForm(): void {
    this.foodForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      category: ['meat' as FoodCategory, Validators.required],
      quantity: [
        FOOD_FORM_CONSTANTS.DEFAULT_QUANTITY,
        [Validators.required, Validators.min(FOOD_FORM_CONSTANTS.MIN_QUANTITY)],
      ],
      unit: ['', Validators.required],
      storageDate: [this.formatDate(new Date()), Validators.required],
      expiryDate: ['', Validators.required],
      notes: [''],
    });
  }

  private initializeFilterForm(): void {
    this.filterForm = this.fb.group({
      searchTerm: [''],
      selectedCategory: [null as FoodCategory | null],
    }) as FormGroup<{
      searchTerm: FormControl<string>;
      selectedCategory: FormControl<FoodCategory | null>;
    }>;
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async addOrUpdateItem(): Promise<void> {
    if (!this.foodForm.valid) return;

    const formValue = this.foodForm.value;
    const itemData = {
      name: formValue.name.trim(),
      category: formValue.category,
      quantity: formValue.quantity,
      unit: formValue.unit.trim(),
      storageDate: new Date(formValue.storageDate),
      expiryDate: new Date(formValue.expiryDate),
      notes: formValue.notes?.trim() || undefined,
    };

    if (this.editingId()) {
      await this.freezerService.updateItem(this.editingId()!, itemData);
      this.editingId.set(null);
    } else {
      await this.freezerService.addItem(itemData);
    }

    this.resetForm();
  }

  async deleteItem(id: string): Promise<void> {
    if (confirm('Are you sure you want to remove this item?')) {
      await this.freezerService.deleteItem(id);
    }
  }

  editItem(item: FoodItem): void {
    this.editingId.set(item.id);
    this.foodForm.patchValue({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      storageDate: this.formatDate(item.storageDate),
      expiryDate: this.formatDate(item.expiryDate),
      notes: item.notes || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  resetForm(): void {
    this.editingId.set(null);
    this.initializeForm();
  }

  /**
   * Gets filtered items based on search term and category selection
   * @returns Filtered array matching search and category criteria
   */
  getFilteredItems(): FoodItem[] {
    const items = this.items();
    const filterValue = this.filterFormValue();
    const searchTerm = filterValue.searchTerm.toLowerCase();
    const selectedCategory = filterValue.selectedCategory;

    return items.filter((currentItem) => {
      const matchesCategory = !selectedCategory || currentItem.category === selectedCategory;
      const matchesSearch =
        !searchTerm ||
        currentItem.name.toLowerCase().includes(searchTerm) ||
        currentItem.notes?.toLowerCase().includes(searchTerm);
      return matchesCategory && matchesSearch;
    });
  }

  /**
   * Sorts items by expiry date (soonest first)
   * @param items - Array of items to sort
   * @returns New array sorted by expiry date ascending
   */
  sortItems(items: FoodItem[]): FoodItem[] {
    return [...items].sort((firstItem, secondItem) => firstItem.expiryDate.getTime() - secondItem.expiryDate.getTime());
  }

  /**
   * Gets the expiry status of an item
   * @param expiryDate - The item's expiry date
   * @returns ExpiryStatus indicating if item is expired, expiring soon, or fresh
   */
  getExpiryStatus(expiryDate: Date): ExpiryStatus {
    return getExpiryStatus(expiryDate);
  }

  /**
   * Handles user logout
   */
  async onLogout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/']);
  }
}
