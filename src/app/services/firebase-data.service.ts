import { Injectable, inject } from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  onSnapshot,
  QuerySnapshot,
  DocumentData,
  Firestore,
} from 'firebase/firestore';
import { firebaseConfig } from '../config/firebase.config';
import { FoodItem } from '../models/food-item';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Firebase service that handles all Firestore database operations
 * Provides real-time synchronization for food items inventory
 * Operations are scoped to the authenticated user
 */
@Injectable({
  providedIn: 'root',
})
export class FirebaseDataService {
  private firestore: Firestore;
  private readonly COLLECTION_NAME = 'foodItems';
  private authService = inject(AuthService);

  constructor() {
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    this.firestore = getFirestore(app);
  }

  /**
   * Gets the current user's ID for database queries
   * @returns User ID or null if not authenticated
   */
  private getUserId(): string | null {
    return this.authService.getCurrentUserId();
  }

  /**
   * Checks if user is authenticated
   * @returns true if user is authenticated
   */
  isUserAuthenticated(): boolean {
    return this.authService.getCurrentUserId() !== null;
  }

  /**
   * Adds a new food item to Firestore
   * @param item - Food item data to add
   * @returns Promise with the document ID
   */
  async addItem(item: Omit<FoodItem, 'id'>): Promise<string> {
    try {
      const userId = this.getUserId();
      if (!userId) {
        throw new Error('User not authenticated');
      }
      const docRef = await addDoc(collection(this.firestore, this.COLLECTION_NAME), {
        ...item,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return docRef.id;
    } catch (error) {
      console.error('Error adding item to Firestore:', error);
      throw error;
    }
  }

  /**
   * Updates an existing food item in Firestore
   * @param id - Document ID of the item
   * @param updates - Partial item data to update
   */
  async updateItem(id: string, updates: Partial<FoodItem>): Promise<void> {
    try {
      const userId = this.getUserId();
      if (!userId) {
        throw new Error('User not authenticated');
      }
      const itemRef = doc(this.firestore, this.COLLECTION_NAME, id);
      await updateDoc(itemRef, {
        ...updates,
        userId,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('Error updating item in Firestore:', error);
      throw error;
    }
  }

  /**
   * Deletes a food item from Firestore
   * @param id - Document ID of the item to delete
   */
  async deleteItem(id: string): Promise<void> {
    try {
      const itemRef = doc(this.firestore, this.COLLECTION_NAME, id);
      await deleteDoc(itemRef);
    } catch (error) {
      console.error('Error deleting item from Firestore:', error);
      throw error;
    }
  }

  /**
   * Fetches all items for the current user from Firestore
   * @returns Promise with array of food items
   * @throws Error if user is not authenticated
   */
  async getItems(): Promise<FoodItem[]> {
    try {
      const userId = this.getUserId();
      if (!userId) {
        throw new Error('User not authenticated');
      }
      const q = query(
        collection(this.firestore, this.COLLECTION_NAME),
        where('userId', '==', userId)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map((foodItemDoc) => ({
        id: foodItemDoc.id,
        ...foodItemDoc.data(),
      } as FoodItem));
    } catch (error) {
      console.error('Error fetching items from Firestore:', error);
      throw error;
    }
  }

  /**
   * Sets up real-time listener for authenticated user's food items
   * @returns Observable that emits updated item array on changes
   */
  getItemsRealtime(): Observable<FoodItem[]> {
    return new Observable((subscriber) => {
      const userId = this.getUserId();
      const q = query(
        collection(this.firestore, this.COLLECTION_NAME),
        where('userId', '==', userId)
      );

      const unsubscribe = onSnapshot(q, (querySnapshot: QuerySnapshot<DocumentData>) => {
        const items = querySnapshot.docs.map((foodItemDoc) => ({
          id: foodItemDoc.id,
          ...foodItemDoc.data(),
        } as FoodItem));
        subscriber.next(items);
      });

      return () => unsubscribe();
    });
  }
}
