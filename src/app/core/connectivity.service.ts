import { DOCUMENT, inject, Injectable, InjectionToken, signal } from '@angular/core';

/** Reads `navigator.onLine`; replaced in tests. */
export const ONLINE_PROBE = new InjectionToken<() => boolean>('ONLINE_PROBE', {
  providedIn: 'root',
  factory: () => () => navigator.onLine,
});

/** Whether the browser thinks it has a network connection (DESIGN.md §4.5). */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly probe = inject(ONLINE_PROBE);
  private readonly _online = signal(this.probe());

  readonly online = this._online.asReadonly();

  constructor() {
    const win = inject(DOCUMENT).defaultView;
    const sync = () => this._online.set(this.probe());
    win?.addEventListener('online', sync);
    win?.addEventListener('offline', sync);
  }

  /** The live browser state, for callers that must not rely on the last event. */
  isOnline(): boolean {
    return this.probe();
  }
}
