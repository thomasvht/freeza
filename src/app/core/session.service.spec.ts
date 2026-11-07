import { TestBed } from '@angular/core/testing';
import { RELOAD_PAGE, SessionService } from './session.service';

describe('SessionService', () => {
  it('flags the session as expired and reloads on request', () => {
    const reload = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: RELOAD_PAGE, useValue: reload }] });
    const session = TestBed.inject(SessionService);
    expect(session.expired()).toBe(false);
    session.markExpired();
    expect(session.expired()).toBe(true);
    session.signInAgain();
    expect(reload).toHaveBeenCalledOnce();
  });
});
