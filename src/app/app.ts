import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { FreezerService } from './services/freezer.service';
import { FoodItem, FoodCategory, FOOD_CATEGORIES, getExpiryStatus, ExpiryStatus } from './models/food-item';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class AppComponent implements OnInit {
  items$!: Observable<FoodItem[]>;
  foodForm!: FormGroup;
  categories = Object.entries(FOOD_CATEGORIES).map(([key, value]) => ({ key: key as FoodCategory, ...value }));
  selectedCategory: FoodCategory | null = null;
  searchTerm = '';
  editingId: string | null = null;

  ExpiryStatus = ExpiryStatus;
  FOOD_CATEGORIES = FOOD_CATEGORIES;

  constructor(private freezerService: FreezerService, private fb: FormBuilder) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.items$ = this.freezerService.getItemsObservable();
  }

  private initializeForm(): void {
    this.foodForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      category: ['meat' as FoodCategory, Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.1)]],
      unit: ['', Validators.required],
      storageDate: [this.formatDate(new Date()), Validators.required],
      expiryDate: ['', Validators.required],
      notes: [''],
    });
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  addOrUpdateItem(): void {
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

    if (this.editingId) {
      this.freezerService.updateItem(this.editingId, itemData);
      this.editingId = null;
    } else {
      this.freezerService.addItem(itemData);
    }

    this.resetForm();
  }

  deleteItem(id: string): void {
    if (confirm('Are you sure you want to remove this item?')) {
      this.freezerService.deleteItem(id);
    }
  }

  editItem(item: FoodItem): void {
    this.editingId = item.id;
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
    this.editingId = null;
    this.initializeForm();
  }

  getFilteredItems(items: FoodItem[]): FoodItem[] {
    return items.filter((item) => {
      const matchesCategory = !this.selectedCategory || item.category === this.selectedCategory;
      const matchesSearch =
        !this.searchTerm ||
        item.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        item.notes?.toLowerCase().includes(this.searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }

  sortItems(items: FoodItem[]): FoodItem[] {
    return [...items].sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
  }

  getExpiryStatus(expiryDate: Date): ExpiryStatus {
    return getExpiryStatus(expiryDate);
  }

  getCategoryColor(category: FoodCategory): string {
    return FOOD_CATEGORIES[category].color;
  }

  getDaysUntilExpiry(expiryDate: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  countExpiringItems(items: FoodItem[]): number {
    return items.filter(i => this.getExpiryStatus(i.expiryDate) === ExpiryStatus.EXPIRING_SOON).length;
  }

  countExpiredItems(items: FoodItem[]): number {
    return items.filter(i => this.getExpiryStatus(i.expiryDate) === ExpiryStatus.EXPIRED).length;
  }
}
