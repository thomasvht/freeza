import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TabBar } from './tab-bar';

describe('TabBar', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('enables + while online', () => {
    const fixture = TestBed.createComponent(TabBar);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button.add').disabled).toBe(false);
  });

  it('disables + while offline', () => {
    const spy = vi.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
    try {
      const fixture = TestBed.createComponent(TabBar);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('button.add').disabled).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
