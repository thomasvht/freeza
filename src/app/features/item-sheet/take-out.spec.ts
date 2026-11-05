import { Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ItemDto } from '@shared/api-types';
import { InventoryStore, type ItemView } from '../../core/inventory.store';
import { ToastService } from '../../core/toast.service';
import { TakeOutSheetComponent } from './take-out-sheet.component';
import { TakeOutSheetService } from './take-out-sheet.service';
import { TakeOutUndoService } from './take-out-undo.service';

@Component({
  imports: [TakeOutSheetComponent],
  template: `
    @if (sheet.isOpen()) {
      <app-take-out-sheet />
    }
  `,
})
class Host {
  protected readonly sheet = inject(TakeOutSheetService);
}

const PEAS: ItemDto = {
  id: 'peas',
  name: 'Peas',
  category: 'veg',
  drawerId: 'drawer-1',
  quantity: 1,
  unit: 'bag',
  packSize: null,
  packUnit: null,
  frozenOn: '2026-10-01',
  bestBefore: '2027-04-01',
  bestBeforeManual: false,
  notes: null,
  createdBy: 'a@example.com',
  updatedBy: 'a@example.com',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};
const RICE: ItemView = {
  ...PEAS,
  id: 'rice',
  name: 'Rice',
  unit: 'kg',
  quantity: 1.5,
  status: 'fresh',
  daysLeft: 100,
  drawerName: 'Drawer 1',
  addedByName: 'A',
};

describe('take out with undo', () => {
  const items = signal<ItemDto[]>([]);
  const store = {
    items,
    takeOut: vi.fn(),
    restoreItem: vi.fn(async () => undefined),
  };
  let toast: ToastService;

  beforeEach(() => {
    vi.clearAllMocks();
    items.set([PEAS, RICE]);
    TestBed.configureTestingModule({ providers: [{ provide: InventoryStore, useValue: store }] });
    toast = TestBed.inject(ToastService);
  });

  it('toasts "Took the last … out" after the last counted unit; Undo restores the old quantity', async () => {
    store.takeOut.mockResolvedValue({ deleted: true, item: PEAS });
    await TestBed.inject(TakeOutUndoService).takeOut(PEAS);
    expect(store.takeOut).toHaveBeenCalledWith('peas');
    const t = toast.current()!;
    expect(t.message).toBe('Took the last Peas out');
    expect(t.actionLabel).toBe('Undo');
    t.action!();
    expect(store.restoreItem).toHaveBeenCalledWith(PEAS, 1);
  });

  it('stays quiet when units remain', async () => {
    store.takeOut.mockResolvedValue({ deleted: false, item: PEAS });
    await TestBed.inject(TakeOutUndoService).takeOut({ ...PEAS, quantity: 3 });
    expect(toast.current()).toBeNull();
  });

  it('swallows a failed take-out (the store already toasted)', async () => {
    store.takeOut.mockRejectedValue(new Error('boom'));
    await expect(TestBed.inject(TakeOutUndoService).takeOut(PEAS)).resolves.toBeUndefined();
    expect(toast.current()).toBeNull();
  });

  describe('take-out sheet', () => {
    let fixture: ComponentFixture<Host>;
    let el: HTMLElement;
    let sheet: TakeOutSheetService;

    async function open(item: ItemView) {
      sheet.open(item);
      fixture.detectChanges();
      await fixture.whenStable();
    }
    const amount = () => el.querySelector<HTMLInputElement>('[name="amount"]')!;
    const confirm = () => el.querySelector<HTMLButtonElement>('button.confirm')!;
    function type(value: string) {
      amount().value = value;
      amount().dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    }

    beforeEach(() => {
      sheet = TestBed.inject(TakeOutSheetService);
      fixture = TestBed.createComponent(Host);
      el = fixture.nativeElement;
    });

    it('takes a decimal-comma amount out of a measured item', async () => {
      store.takeOut.mockResolvedValue({ deleted: false, item: RICE });
      await open(RICE);
      expect(el.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Take out Rice');
      type('0,3');
      confirm().click();
      expect(store.takeOut).toHaveBeenCalledWith('rice', 0.3);
      expect(sheet.isOpen()).toBe(false);
    });

    it('offers Undo with the pre-take quantity when the amount empties the item', async () => {
      store.takeOut.mockResolvedValue({ deleted: true, item: RICE });
      await open(RICE);
      type('1,5');
      confirm().click();
      await fixture.whenStable();
      const t = toast.current()!;
      expect(t.message).toBe('Took the last Rice out');
      t.action!();
      expect(store.restoreItem).toHaveBeenCalledWith(RICE, 1.5);
    });

    it('disables Take out for empty, zero, invalid or too-large amounts', async () => {
      await open(RICE);
      expect(confirm().disabled).toBe(true);
      type('0');
      expect(confirm().disabled).toBe(true);
      type('abc');
      expect(confirm().disabled).toBe(true);
      type('1,6');
      expect(confirm().disabled).toBe(true);
      type('0,5');
      expect(confirm().disabled).toBe(false);
    });

    it('uses the current store quantity for the bound and for undo, not the one from open', async () => {
      store.takeOut.mockResolvedValue({ deleted: true, item: RICE });
      await open(RICE);
      items.set([{ ...RICE, quantity: 0.5 }]); // a refresh while the sheet is open
      fixture.detectChanges();
      type('1');
      expect(confirm().disabled).toBe(true);
      type('0,5');
      expect(confirm().disabled).toBe(false);
      confirm().click();
      await fixture.whenStable();
      toast.current()!.action!();
      expect(store.restoreItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'rice' }), 0.5);
    });

    it('closes on Cancel and on Escape', async () => {
      await open(RICE);
      el.querySelector<HTMLButtonElement>('button.cancel')!.click();
      expect(sheet.isOpen()).toBe(false);
      await open(RICE);
      el.querySelector('[role="dialog"]')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      expect(sheet.isOpen()).toBe(false);
    });
  });
});
