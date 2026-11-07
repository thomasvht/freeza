import { inject, Injectable, InjectionToken, signal } from '@angular/core';

/** Reloads the page; replaced in tests. */
export const RELOAD_PAGE = new InjectionToken<() => void>('RELOAD_PAGE', {
  providedIn: 'root',
  factory: () => () => location.reload(),
});

/** Whether the Cloudflare Access session has expired (ARCHITECTURE.md §5). */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly reload = inject(RELOAD_PAGE);
  private readonly _expired = signal(false);

  readonly expired = this._expired.asReadonly();

  markExpired(): void {
    this._expired.set(true);
  }

  /** Reloads so Access can run its login flow. */
  signInAgain(): void {
    this.reload();
  }
}
