import { Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { DrawerDto, ItemDto, SuggestionDto } from '@shared/api-types';
import { suggestBestBefore } from '@shared/expiry';
import { InventoryStore } from '../../core/inventory.store';
import { ToastService } from '../../core/toast.service';
import { ItemSheetComponent } from './item-sheet.component';
import { ItemSheetService } from './item-sheet.service';

const TODAY = '2026-11-05';
const BEEF_ID = '3f6c1c52-3f0e-4c58-8a35-0a1d6f1c9b11';

@Component({
  imports: [ItemSheetComponent],
  template: `
    <button id="opener" type="button" (click)="sheet.open()">+</button>
    @if (sheet.isOpen()) {
      <app-item-sheet />
    }
  `,
})
class Host {
  protected readonly sheet = inject(ItemSheetService);
}

const BEEF: ItemDto = {
  id: BEEF_ID,
  name: 'Minced beef',
  category: 'meat',
  drawerId: 'drawer-1',
  quantity: 2,
  unit: 'piece',
  packSize: 500,
  packUnit: 'g',
  frozenOn: '2026-10-01',
  bestBefore: '2027-04-01',
  bestBeforeManual: false,
  notes: null,
  createdBy: 'thomas@example.com',
  updatedBy: 'thomas@example.com',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

describe('ItemSheetComponent', () => {
  const drawers = signal<DrawerDto[]>([]);
  const suggestions = signal<SuggestionDto[]>([]);
  const store = {
    drawers,
    suggestions,
    today: signal(TODAY),
    createItem: vi.fn(async () => undefined),
    updateItem: vi.fn(async () => undefined),
    deleteItem: vi.fn(async () => BEEF),
    restoreItem: vi.fn(async () => undefined),
  };
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;
  let service: ItemSheetService;

  beforeEach(() => {
    vi.clearAllMocks();
    drawers.set([
      { id: 'drawer-1', name: 'Drawer 1', position: 1 },
      { id: 'drawer-2', name: 'Drawer 2', position: 2 },
    ]);
    suggestions.set([]);
    TestBed.configureTestingModule({
      providers: [{ provide: InventoryStore, useValue: store }],
    });
    service = TestBed.inject(ItemSheetService);
    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement;
  });

  async function open(item?: ItemDto) {
    service.open(item);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const q = <T extends HTMLElement>(selector: string) => el.querySelector<T>(selector)!;
  const field = (name: string) =>
    q<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`);
  function type(name: string, value: string) {
    const input = field(name);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }
  function choose(name: string, value: string) {
    const select = field(name);
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  }
  function click(selector: string) {
    q(selector).click();
    fixture.detectChanges();
  }
  const save = () => q<HTMLButtonElement>('button.save');
  const options = () => [...el.querySelectorAll('[role="listbox"] [role="option"]')];

  it('starts a new item frozen today with the suggested best before', async () => {
    await open();
    expect(field('frozenOn').value).toBe(TODAY);
    expect(field('bestBefore').value).toBe(suggestBestBefore(TODAY, 'meat'));
    expect(el.querySelector('.suggested')?.textContent).toContain('suggested');
    expect(q('[data-category="meat"]').getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-drawer="drawer-1"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('updates best before when the category changes', async () => {
    await open();
    click('[data-category="fish"]');
    expect(field('bestBefore').value).toBe(suggestBestBefore(TODAY, 'fish'));
  });

  it('keeps a hand-edited best before and sends bestBeforeManual', async () => {
    await open();
    type('name', 'Cod');
    type('bestBefore', '2027-01-01');
    expect(el.querySelector('.suggested')).toBeNull();
    click('[data-category="fish"]');
    expect(field('bestBefore').value).toBe('2027-01-01');
    click('button.save');
    expect(store.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        bestBefore: '2027-01-01',
        bestBeforeManual: true,
        category: 'fish',
      }),
    );
  });

  it('lists suggestions for typed text and fills the form from a pick', async () => {
    suggestions.set([
      {
        name: 'Minced beef',
        category: 'fish',
        drawerId: 'drawer-2',
        unit: 'bag',
        packSize: 500,
        packUnit: 'g',
      },
      {
        name: 'Peas',
        category: 'veg',
        drawerId: 'drawer-1',
        unit: 'bag',
        packSize: null,
        packUnit: null,
      },
    ]);
    await open();
    type('name', 'Min');
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Minced beef']);
    (options()[0] as HTMLElement).click();
    fixture.detectChanges();
    expect(field('name').value).toBe('Minced beef');
    expect(q('[data-category="fish"]').getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-drawer="drawer-2"]').getAttribute('aria-pressed')).toBe('true');
    expect(field('unit').value).toBe('bag');
    expect(field('packSize').value).toBe('500');
    expect(options().length).toBe(0);
  });

  it('picks a suggestion with the arrow keys and Enter', async () => {
    suggestions.set([
      {
        name: 'Minced beef',
        category: 'meat',
        drawerId: 'drawer-2',
        unit: 'piece',
        packSize: null,
        packUnit: null,
      },
      {
        name: 'Minced pork',
        category: 'meat',
        drawerId: 'drawer-1',
        unit: 'piece',
        packSize: null,
        packUnit: null,
      },
    ]);
    await open();
    type('name', 'Min');
    const key = (k: string) => {
      field('name').dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      fixture.detectChanges();
    };
    key('ArrowDown');
    key('ArrowDown');
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
    key('Enter');
    expect(field('name').value).toBe('Minced pork');
  });

  it('falls back to the first drawer when the suggested one is gone', async () => {
    suggestions.set([
      {
        name: 'Minced beef',
        category: 'meat',
        drawerId: 'drawer-9',
        unit: 'piece',
        packSize: null,
        packUnit: null,
      },
    ]);
    await open();
    type('name', 'Min');
    (options()[0] as HTMLElement).click();
    fixture.detectChanges();
    expect(q('[data-drawer="drawer-1"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows pack size only for counted units and clears it when switching to a weight', async () => {
    await open();
    type('packSize', '500');
    expect(field('packSize')).toBeTruthy();
    choose('unit', 'kg');
    expect(el.querySelector('[name="packSize"]')).toBeNull();
    choose('unit', 'piece');
    expect(field('packSize').value).toBe('');
  });

  it('submits a decimal-comma quantity as a number, with a generated id', async () => {
    await open();
    type('name', '  Rice ');
    choose('unit', 'kg');
    type('quantity', '0,5');
    click('button.save');
    expect(store.createItem).toHaveBeenCalledOnce();
    const body = (store.createItem.mock.calls[0] as unknown[])[0];
    expect(body).toEqual(
      expect.objectContaining({
        name: 'Rice',
        quantity: 0.5,
        unit: 'kg',
        packSize: null,
        packUnit: null,
        notes: null,
        bestBeforeManual: false,
      }),
    );
    expect((body as { id: string }).id).toMatch(/^[0-9a-f-]{36}$/);
    expect(service.isOpen()).toBe(false);
  });

  it('disables Save exactly when the server would reject the item', async () => {
    await open();
    expect(save().disabled).toBe(true); // no name
    type('name', 'Peas');
    expect(save().disabled).toBe(false);
    type('quantity', '1,5'); // fractional counted unit
    expect(save().disabled).toBe(true);
    type('quantity', '0');
    expect(save().disabled).toBe(true);
    type('quantity', '2');
    type('bestBefore', '2026-01-01'); // before frozen on
    expect(save().disabled).toBe(true);
    type('bestBefore', '2027-01-01');
    type('packSize', 'abc');
    expect(save().disabled).toBe(true);
    type('packSize', '');
    type('notes', 'x'.repeat(201));
    expect(save().disabled).toBe(true);
    type('notes', 'x'.repeat(200));
    type('name', 'y'.repeat(61));
    expect(save().disabled).toBe(true);
  });

  it('steps the quantity with the stepper', async () => {
    await open();
    click('.inc');
    expect(field('quantity').value).toBe('2');
    click('.dec');
    click('.dec');
    expect(field('quantity').value).toBe('1');
  });

  it('prefills edit mode and saves a patch', async () => {
    await open(BEEF);
    expect(field('name').value).toBe('Minced beef');
    expect(field('quantity').value).toBe('2');
    expect(field('packSize').value).toBe('500');
    type('quantity', '3');
    click('button.save');
    expect(store.updateItem).toHaveBeenCalledWith(
      BEEF_ID,
      expect.objectContaining({ quantity: 3, name: 'Minced beef' }),
    );
    expect(store.createItem).not.toHaveBeenCalled();
  });

  it('shows Delete only when editing; delete toasts with Undo that restores', async () => {
    await open();
    expect(el.querySelector('button.delete')).toBeNull();
    service.close();
    fixture.detectChanges();
    await open(BEEF);
    click('button.delete');
    await fixture.whenStable();
    expect(store.deleteItem).toHaveBeenCalledWith(BEEF_ID);
    expect(service.isOpen()).toBe(false);
    const toast = TestBed.inject(ToastService).current()!;
    expect(toast.message).toBe('Deleted Minced beef');
    expect(toast.actionLabel).toBe('Undo');
    toast.action!();
    expect(store.restoreItem).toHaveBeenCalledWith(BEEF);
  });

  it('is a labelled modal dialog that closes on Escape and on a backdrop tap', async () => {
    await open();
    const dialog = q('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Add item');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(service.isOpen()).toBe(false);
    await open();
    click('.backdrop');
    expect(service.isOpen()).toBe(false);
  });

  it('moves focus into the sheet and back to the opener on close', async () => {
    const opener = q<HTMLButtonElement>('#opener');
    opener.focus();
    opener.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(field('name'));
    service.close();
    fixture.detectChanges();
    expect(document.activeElement).toBe(opener);
  });
});
