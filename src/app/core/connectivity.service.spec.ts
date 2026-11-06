import { TestBed } from '@angular/core/testing';
import { ConnectivityService, ONLINE_PROBE } from './connectivity.service';

describe('ConnectivityService', () => {
  let onLine: boolean;

  function setup(): ConnectivityService {
    TestBed.configureTestingModule({ providers: [{ provide: ONLINE_PROBE, useValue: () => onLine }] });
    return TestBed.inject(ConnectivityService);
  }

  it('starts from the browser state', () => {
    onLine = false;
    expect(setup().online()).toBe(false);
  });

  it('follows the offline and online window events', () => {
    onLine = true;
    const connectivity = setup();
    expect(connectivity.online()).toBe(true);

    onLine = false;
    window.dispatchEvent(new Event('offline'));
    expect(connectivity.online()).toBe(false);

    onLine = true;
    window.dispatchEvent(new Event('online'));
    expect(connectivity.online()).toBe(true);
  });

  it('reads the live browser state with isOnline()', () => {
    onLine = true;
    const connectivity = setup();
    onLine = false;
    expect(connectivity.isOnline()).toBe(false);
  });
});
