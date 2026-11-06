import { TestBed } from '@angular/core/testing';
import { RELOAD_PAGE, SessionService } from '../../core/session.service';
import { OfflineBanner } from './offline-banner';

describe('OfflineBanner', () => {
  const reload = vi.fn();

  beforeEach(() => {
    reload.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: RELOAD_PAGE, useValue: reload }] });
  });

  it('renders nothing while online with a valid session', () => {
    const fixture = TestBed.createComponent(OfflineBanner);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('shows "Offline – changes are disabled" while offline', () => {
    const spy = vi.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
    try {
      const fixture = TestBed.createComponent(OfflineBanner);
      fixture.detectChanges();
      const status = fixture.nativeElement.querySelector('[role="status"]');
      expect(status.textContent).toContain('Offline – changes are disabled');
    } finally {
      spy.mockRestore();
    }
  });

  it('shows the session banner and reloads when it is tapped', () => {
    const fixture = TestBed.createComponent(OfflineBanner);
    TestBed.inject(SessionService).markExpired();
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.textContent).toContain('Session expired – tap to sign in again');
    button.click();
    expect(reload).toHaveBeenCalledOnce();
  });
});
