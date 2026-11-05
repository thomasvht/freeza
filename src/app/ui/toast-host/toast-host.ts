import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideX } from '@lucide/angular';
import { ToastService } from '../../core/toast.service';
import { S } from '../../strings';

@Component({
  selector: 'app-toast-host',
  imports: [LucideX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="region" aria-live="polite">
      @if (toasts.current(); as toast) {
        <div class="toast">
          <span class="message">{{ toast.message }}</span>
          @if (toast.action && toast.actionLabel) {
            <button type="button" class="action" (click)="run(toast.action)">
              {{ toast.actionLabel }}
            </button>
          }
          <button type="button" class="close" [attr.aria-label]="s.dismiss" (click)="toasts.dismiss()">
            <svg lucideX [size]="20" [strokeWidth]="2" aria-hidden="true"></svg>
          </button>
        </div>
      }
    </div>
  `,
  styleUrl: './toast-host.scss',
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);
  protected readonly s = S.toast;

  protected run(action: () => void): void {
    this.toasts.dismiss();
    action();
  }
}
