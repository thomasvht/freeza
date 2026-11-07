import { Injectable, signal } from '@angular/core';

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  action?: () => void;
  durationMs?: number;
}

export interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  action?: () => void;
}

const DEFAULT_DURATION_MS = 5000;

/** One toast at a time: a new toast replaces the current one. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _current = signal<Toast | null>(null);
  readonly current = this._current.asReadonly();

  private nextId = 1;
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(t: ToastOptions): void {
    clearTimeout(this.timer);
    const toast: Toast = {
      id: this.nextId++,
      message: t.message,
      actionLabel: t.actionLabel,
      action: t.action,
    };
    this._current.set(toast);
    this.timer = setTimeout(() => this.dismiss(toast.id), t.durationMs ?? DEFAULT_DURATION_MS);
  }

  /** Dismisses the current toast, or only the given one if it is still current. */
  dismiss(id?: number): void {
    const current = this._current();
    if (!current || (id !== undefined && current.id !== id)) return;
    clearTimeout(this.timer);
    this._current.set(null);
  }
}
