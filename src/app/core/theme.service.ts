import { DOCUMENT, inject, Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

/** Also read by the inline script in `index.html`. */
const STORAGE_KEY = 'freeza-theme';
const NEXT: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly _mode = signal<ThemeMode>(readStored());
  readonly mode = this._mode.asReadonly();

  constructor() {
    this.apply();
    // In system mode the theme-color follows the OS setting.
    this.document.defaultView
      ?.matchMedia?.('(prefers-color-scheme: dark)')
      .addEventListener?.('change', () => this.updateThemeColor());
  }

  cycle(): void {
    const next = NEXT[this._mode()];
    this._mode.set(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode): the choice lasts for this session only.
    }
    this.apply();
  }

  private apply(): void {
    const root = this.document.documentElement;
    const mode = this._mode();
    if (mode === 'system') delete root.dataset['theme'];
    else root.dataset['theme'] = mode;
    this.updateThemeColor();
  }

  private updateThemeColor(): void {
    const view = this.document.defaultView;
    const meta = this.document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!view || !meta) return;
    const color = view.getComputedStyle(this.document.documentElement).getPropertyValue('--bg-solid').trim();
    if (color) meta.content = color;
  }
}

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}
