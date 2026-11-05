import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

const KEY = 'freeza-theme';

describe('ThemeService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });

  it('starts from the stored choice', () => {
    localStorage.setItem(KEY, 'dark');
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('cycles system → light → dark → system and persists the choice', () => {
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('system');
    expect(document.documentElement.dataset['theme']).toBeUndefined();

    theme.cycle();
    expect(theme.mode()).toBe('light');
    expect(localStorage.getItem(KEY)).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');

    theme.cycle();
    expect(theme.mode()).toBe('dark');
    expect(localStorage.getItem(KEY)).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    theme.cycle();
    expect(theme.mode()).toBe('system');
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('survives a localStorage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('system');
    expect(() => theme.cycle()).not.toThrow();
    expect(theme.mode()).toBe('light');
  });
});
