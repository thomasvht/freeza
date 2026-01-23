import { Component, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

/**
 * Login component for user authentication
 */
@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  loginForm: FormGroup;
  isLoading = signal(false);
  errorMessage = signal<string>('');

  switchToSignup = output<void>();

  constructor(private fb: FormBuilder, private authService: AuthService) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }
  /**
   * Handles login form submission
   */
  async onLogin(): Promise<void> {
    if (!this.loginForm.valid) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const { email, password } = this.loginForm.value;
      await this.authService.login(email, password);
    } catch (error) {
      this.errorMessage.set(error as string);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Handles Google sign-in
   */
  async onLoginWithGoogle(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      await this.authService.loginWithGoogle();
    } catch (error) {
      this.errorMessage.set(error as string);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Emits event to switch to signup component
   */
  onSwitchToSignup(): void {
    this.switchToSignup.emit();
  }
}
