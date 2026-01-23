import { Injectable, signal, effect } from '@angular/core';
import { FoodItem, FoodCategory } from '../models/food-item';
import { FirebaseDataService } from './firebase-data.service';
import { AuthService } from './auth.service';

/**
 * Type for the stored JSON representation of FoodItem
 * Used for type-safe deserialization from localStorage
 */
interface StoredFoodItem {
  id: string;
  name: string;
  category: FoodCategory;
  quantity: number;
  unit: string;
  storageDate: string;
  expiryDate: string;
  notes?: string;
}

@Injectable({
  providedIn: 'root',
})
export class FreezerService {
  private readonly STORAGE_KEY = 'freezer-inventory';
  private itemsSignal = signal<FoodItem[]>([]);
  private useFirebase = true;

  // Expose as read-only signal
  readonly items = this.itemsSignal.asReadonly();

  constructor(
    private firebaseService: FirebaseDataService,
    private authService: AuthService
  ) {
    this.initializeData();
  }

  /**
   * Initializes data from Firebase or localStorage
   */
  private initializeData(): void {
    // Wait for auth to be ready before loading from Firebase
    // Use longer timeout to ensure auth state is initialized
    setTimeout(() => {
      // Check if user is authenticated before attempting Firebase load
      if (!this.authService.getCurrentUserId()) {
        console.warn('User not authenticated, using localStorage');
        this.useFirebase = false;
        this.loadFromLocalStorage();
        return;
      }

      this.loadFromFirebase().catch((error) => {
        console.warn('Firebase unavailable, falling back to localStorage:', error);
        this.useFirebase = false;
        this.loadFromLocalStorage();
      });
    }, 1000);
  }

  /**
   * Loads items from Firebase with real-time updates
   */
  private async loadFromFirebase(): Promise<void> {
    try {
      // Set up real-time listener
      const realtimeSubscription = this.firebaseService
        .getItemsRealtime()
        .subscribe(
          (items) => {
            this.itemsSignal.set(items);
            // Also sync to localStorage as backup
            this.saveToLocalStorage(items);
          },
          (error) => {
            // If auth not ready, fallback to localStorage
            if (error.message.includes('not authenticated')) {
              this.useFirebase = false;
              this.loadFromLocalStorage();
            }
          }
        );

      // Initial load
      const items = await this.firebaseService.getItems();
      this.itemsSignal.set(items);
      this.useFirebase = true;
    } catch (error) {
      // If user not authenticated, just use localStorage
      if ((error as Error).message.includes('not authenticated')) {
        throw error;
      }
      console.warn('Firebase unavailable, falling back to localStorage:', error);
      throw error;
    }
  }

  /**
   * Loads items from localStorage
   */
  private loadFromLocalStorage(): void {
    try {
      const storedInventoryJson = localStorage.getItem(this.STORAGE_KEY);
      if (!storedInventoryJson) {
        return;
      }

      const storedItems: StoredFoodItem[] = JSON.parse(storedInventoryJson);
      const deserializedItems = storedItems.map((storedItem) => this.deserializeFoodItem(storedItem));
      this.itemsSignal.set(deserializedItems);
    } catch (error) {
      console.error('Failed to load freezer inventory from localStorage', error);
    }
  }

  /**
   * Converts stored JSON item back to FoodItem with proper date objects
   * @param item - Stored item with date strings
   * @returns Properly typed FoodItem with Date objects
   */
  private deserializeFoodItem(item: StoredFoodItem): FoodItem {
    return {
      ...item,
      storageDate: new Date(item.storageDate),
      expiryDate: new Date(item.expiryDate),
    };
  }

  /**
   * Saves items to localStorage
   * @param items - Array of FoodItems to persist
   */
  private saveToLocalStorage(items: FoodItem[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('Failed to save freezer inventory to localStorage', error);
    }
  }

  /**
   * Adds a new item to the inventory
   * Saves to Firebase if available, otherwise to localStorage
   * @param item - Item to add (without id)
   * @returns Promise with the newly created FoodItem
   */
  async addItem(item: Omit<FoodItem, 'id'>): Promise<FoodItem> {
    const newItem: FoodItem = {
      ...item,
      id: this.generateId(),
    };

    if (this.useFirebase) {
      try {
        const firebaseId = await this.firebaseService.addItem(item);
        newItem.id = firebaseId;
      } catch (error) {
        console.error('Error adding item to Firebase, using local ID:', error);
      }
    }

    const items = this.items();
    const updatedItems = [...items, newItem];
    this.itemsSignal.set(updatedItems);
    this.saveToLocalStorage(updatedItems);
    return newItem;
  }

  /**
   * Updates an existing item in the inventory
   * @param id - ID of the item to update
   * @param updates - Partial FoodItem with fields to update
   */
  async updateItem(id: string, updates: Partial<FoodItem>): Promise<void> {
    if (this.useFirebase) {
      try {
        await this.firebaseService.updateItem(id, updates);
      } catch (error) {
        console.error('Error updating item in Firebase:', error);
      }
    }

    const items = this.items().map((currentItem) =>
      currentItem.id === id ? { ...currentItem, ...updates } : currentItem
    );
    this.itemsSignal.set(items);
    this.saveToLocalStorage(items);
  }

  /**
   * Deletes an item from the inventory
   * @param id - ID of the item to delete
   */
  async deleteItem(id: string): Promise<void> {
    if (this.useFirebase) {
      try {
        await this.firebaseService.deleteItem(id);
      } catch (error) {
        console.error('Error deleting item from Firebase:', error);
      }
    }

    const items = this.items().filter((currentItem) => currentItem.id !== id);
    this.itemsSignal.set(items);
    this.saveToLocalStorage(items);
  }

  /**
   * Gets all items from the signal (synchronous)
   * @returns Current array of all FoodItems
   */
  getItems(): FoodItem[] {
    return this.items();
  }

  /**
   * Generates a unique identifier for a new item
   * @returns Unique string combining timestamp and random component
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

