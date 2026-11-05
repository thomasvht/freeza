import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { ApiClient } from './core/api.client';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: ApiClient, useValue: { get: () => new Promise(() => {}) } },
      ],
    });
  });

  it('renders a tab bar with Freezer and Recipes', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const tabBar: HTMLElement = fixture.nativeElement.querySelector('app-tab-bar');
    expect(tabBar).toBeTruthy();
    expect(tabBar.textContent).toContain('Freezer');
    expect(tabBar.textContent).toContain('Recipes');
    expect(fixture.nativeElement.querySelector('app-toast-host [aria-live="polite"]')).toBeTruthy();
    fixture.destroy();
  });
});
