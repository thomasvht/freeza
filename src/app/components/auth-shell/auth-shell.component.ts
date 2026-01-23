import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoginComponent } from '../login/login.component';
import { SignupComponent } from '../signup/signup.component';

/**
 * Auth shell component that manages the login/signup view switching
 */
@Component({
  selector: 'app-auth-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LoginComponent, SignupComponent],
  templateUrl: './auth-shell.component.html',
  styleUrls: ['./auth-shell.component.scss'],
})
export class AuthShellComponent {
  showLogin = signal(true);

  /**
   * Switch to signup view
   */
  switchToSignup(): void {
    this.showLogin.set(false);
  }

  /**
   * Switch to login view
   */
  switchToLogin(): void {
    this.showLogin.set(true);
  }
}
