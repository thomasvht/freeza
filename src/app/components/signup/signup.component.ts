import { Component, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

/**
 * Signup component for user registration
 */
@Component({
  selector: 'app-signup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss'],
})
export class SignupComponent {
  signupForm: FormGroup;
  isLoading = signal(false);
  errorMessage = signal<string>('');

  switchToLogin = output<void>();

  constructor(private fb: FormBuilder, private authService: AuthService) {
    this.signupForm = this.fb.group(
      {
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  /**
   * Custom validator to ensure passwords match
   */
  private passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;

    if (password && confirmPassword && password !== confirmPassword) {
      group.get('confirmPassword')?.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }

    return null;
  }

  /**
   * Handles signup form submission
   */
  async onSignup(): Promise<void> {
    if (!this.signupForm.valid) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const { email, password } = this.signupForm.value;
      await this.authService.register(email, password);
    } catch (error) {
      this.errorMessage.set(error as string);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Handles Google sign-up
   */
  async onSignupWithGoogle(): Promise<void> {
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
   * Emits event to switch to login component
   */
  onSwitchToLogin(): void {
    this.switchToLogin.emit();
  }
}
