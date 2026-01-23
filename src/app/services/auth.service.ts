import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { firebaseConfig } from '../firebase.config';
import { signal, computed } from '@angular/core';

/**
 * Authentication service that manages user login, registration, and session
 * Uses Firebase Authentication for secure user management
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth: Auth;
  private userSignal = signal<User | null>(null);
  private isAuthenticatedSignal = computed(() => this.userSignal() !== null);

  // Expose user as read-only signal
  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = this.isAuthenticatedSignal;
  readonly userId = computed(() => this.userSignal()?.uid ?? null);

  constructor() {
    const app = initializeApp(firebaseConfig);
    this.auth = getAuth(app);
    this.initializeAuthState();
  }

  /**
   * Initialize authentication state listener
   */
  private initializeAuthState(): void {
    onAuthStateChanged(this.auth, (user) => {
      this.userSignal.set(user);
    });
  }

  /**
   * Register a new user with email and password
   * @param email - User email address
   * @param password - User password (min 6 characters)
   * @returns Promise with user credentials
   */
  async register(email: string, password: string): Promise<User> {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      return userCredential.user;
    } catch (error) {
      console.error('Registration error:', error);
      throw this.formatAuthError(error);
    }
  }

  /**
   * Sign in user with email and password
   * @param email - User email address
   * @param password - User password
   * @returns Promise with user credentials
   */
  async login(email: string, password: string): Promise<User> {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      return userCredential.user;
    } catch (error) {
      console.error('Login error:', error);
      throw this.formatAuthError(error);
    }
  }

  /**
   * Sign in user with Google account
   * @returns Promise with user credentials
   */
  async loginWithGoogle(): Promise<User> {
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(this.auth, provider);
      return userCredential.user;
    } catch (error) {
      console.error('Google login error:', error);
      throw this.formatAuthError(error);
    }
  }

  /**
   * Sign out the current user
   */
  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Gets the current user
   * @returns Current authenticated user or null
   */
  getCurrentUser(): User | null {
    return this.userSignal();
  }

  /**
   * Gets the current user's ID
   * @returns User ID or null if not authenticated
   */
  getCurrentUserId(): string | null {
    return this.userSignal()?.uid ?? null;
  }

  /**
   * Formats Firebase auth errors into user-friendly messages
   * @param error - Firebase auth error
   * @returns Formatted error message
   */
  private formatAuthError(error: any): string {
    const errorCode = error.code || '';
    const errorMessages: { [key: string]: string } = {
      'auth/email-already-in-use': 'Email is already registered. Please sign in instead.',
      'auth/weak-password': 'Password is too weak. Please use at least 6 characters.',
      'auth/invalid-email': 'Invalid email address.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/too-many-requests': 'Too many login attempts. Please try again later.',
      'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
      'auth/popup-blocked': 'Sign-in popup was blocked. Please allow popups and try again.',
      'auth/cancelled-popup-request': 'Another sign-in popup is already open.',
    };

    return errorMessages[errorCode] || error.message || 'An error occurred. Please try again.';
  }
}
