import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { ApiClient } from './core/api.client';
import { SessionService } from './core/session.service';

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

  it('shows the session-expired banner in the shell when an API call is rejected', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(SessionService).markExpired();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-offline-banner')?.textContent).toContain(
      'Session expired – tap to sign in again',
    );
    fixture.destroy();
  });
});
