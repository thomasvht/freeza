import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FoodItem } from '../models/food-item';

@Injectable({
  providedIn: 'root',
})
export class FreezerService {
  private readonly STORAGE_KEY = 'freezer-inventory';
  private itemsSubject = new BehaviorSubject<FoodItem[]>(this.loadItems());
  public items$ = this.itemsSubject.asObservable();

  constructor() {}

  private loadItems(): FoodItem[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const items = JSON.parse(stored);
        // Convert date strings back to Date objects
        return items.map((item: any) => ({
          ...item,
          storageDate: new Date(item.storageDate),
          expiryDate: new Date(item.expiryDate),
        }));
      }
    } catch (error) {
      console.error('Error loading items from localStorage:', error);
    }
    return [];
  }

  private saveItems(items: FoodItem[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
      this.itemsSubject.next([...items]);
    } catch (error) {
      console.error('Error saving items to localStorage:', error);
    }
  }

  addItem(item: Omit<FoodItem, 'id'>): FoodItem {
    const newItem: FoodItem = {
      ...item,
      id: this.generateId(),
    };
    const items = this.itemsSubject.value;
    this.saveItems([...items, newItem]);
    return newItem;
  }

  updateItem(id: string, updates: Partial<FoodItem>): void {
    const items = this.itemsSubject.value.map((item) =>
      item.id === id ? { ...item, ...updates } : item
    );
    this.saveItems(items);
  }

  deleteItem(id: string): void {
    const items = this.itemsSubject.value.filter((item) => item.id !== id);
    this.saveItems(items);
  }

  getItems(): FoodItem[] {
    return this.itemsSubject.value;
  }

  getItemsObservable(): Observable<FoodItem[]> {
    return this.items$;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
