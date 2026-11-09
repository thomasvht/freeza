import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConnectivityService } from '../../../core/connectivity.service';
import type { ItemView } from '../../../core/inventory.store';
import { ItemCardComponent } from './item-card';

export function view(over: Partial<ItemView> = {}): ItemView {
  return {
    id: 'beef',
    name: 'Minced beef',
    category: 'meat',
    drawerId: 'drawer-1',
    quantity: 2,
    unit: 'piece',
    packSize: 500,
    packUnit: 'g',
    frozenOn: '2026-10-01',
    bestBefore: '2026-11-09',
    bestBeforeManual: false,
    notes: null,
    createdBy: 'thomas@example.com',
    updatedBy: 'thomas@example.com',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    status: 'use-soon',
    daysLeft: 4,
    drawerName: 'Top',
    addedByName: 'Thomas',
    ...over,
  };
}

function setup(item: ItemView) {
  const fixture = TestBed.createComponent(ItemCardComponent);
  fixture.componentRef.setInput('item', item);
  fixture.detectChanges();
  return fixture;
}

describe('ItemCardComponent', () => {
  it('shows name, quantity with best-before date and the days-left chip', () => {
    const el: HTMLElement = setup(view()).nativeElement;
    expect(el.textContent).toContain('Minced beef');
    expect(el.textContent).toContain('2 × 500 g · 09/11/2026');
    expect(el.querySelector('.chip')?.textContent?.trim()).toBe('4 days');
  });

  it('labels the − button and emits take', () => {
    const item = view();
    const fixture = setup(item);
    const taken: ItemView[] = [];
    fixture.componentInstance.take.subscribe((i) => taken.push(i));
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.take');
    expect(button.getAttribute('aria-label')).toBe('Take one Minced beef out');
    button.click();
    expect(taken).toEqual([item]);
  });

  it('emits open when the card body is tapped', () => {
    const item = view();
    const fixture = setup(item);
    const opened: ItemView[] = [];
    fixture.componentInstance.open.subscribe((i) => opened.push(i));
    fixture.nativeElement.querySelector('.main').click();
    expect(opened).toEqual([item]);
  });

  it('colours the bar with the category token', () => {
    const el: HTMLElement = setup(view()).nativeElement;
    const bar = el.querySelector<HTMLElement>('.bar');
    expect(bar?.getAttribute('style')).toContain('var(--cat-meat)');
  });

  it('marks the chip with the status class', () => {
    const el: HTMLElement = setup(view({ status: 'expired', daysLeft: -1 })).nativeElement;
    const chip = el.querySelector('.chip');
    expect(chip?.classList).toContain('expired');
    expect(chip?.textContent?.trim()).toBe('Expired');
  });

  it('ticks the number over when the quantity changes, not on first render', () => {
    const fixture = setup(view());
    const qty = () => fixture.nativeElement.querySelector('.qty') as HTMLElement;
    expect(qty().classList).not.toContain('tick');
    fixture.componentRef.setInput('item', view({ quantity: 1 }));
    fixture.detectChanges();
    expect(qty().textContent?.trim()).toBe('1 × 500 g');
    expect(qty().classList).toContain('tick');
  });
});

describe('ItemCardComponent offline', () => {
  it('disables − while offline', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: ConnectivityService, useValue: { online: signal(false) } }],
    });
    const fixture = setup(view());
    expect(fixture.nativeElement.querySelector('.take').disabled).toBe(true);
  });

  it('enables − while online', () => {
    const fixture = setup(view());
    expect(fixture.nativeElement.querySelector('.take').disabled).toBe(false);
  });
});
