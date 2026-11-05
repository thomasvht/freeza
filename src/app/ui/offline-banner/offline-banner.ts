import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConnectivityService } from '../../core/connectivity.service';
import { SessionService } from '../../core/session.service';
import { S } from '../../strings';

/** Top-of-screen status: the session-expired prompt (tap to sign in) or the offline notice. */
@Component({
  selector: 'app-offline-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session.expired()) {
      <button type="button" class="banner session" (click)="session.signInAgain()">
        {{ s.sessionExpired }}
      </button>
    } @else if (!connectivity.online()) {
      <div class="banner offline" role="status">{{ s.offline }}</div>
    }
  `,
  styleUrl: './offline-banner.scss',
})
export class OfflineBanner {
  protected readonly session = inject(SessionService);
  protected readonly connectivity = inject(ConnectivityService);
  protected readonly s = S.status;
}
