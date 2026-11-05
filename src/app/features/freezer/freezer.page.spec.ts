import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { InventoryResponse, ItemDto } from '@shared/api-types';
import { todayLocal } from '@shared/dates';
import { ApiClient } from '../../core/api.client';
import { InventoryStore } from '../../core/inventory.store';
import { ThemeService } from '../../core/theme.service';
import { ITEM_SHEET, TAKE_OUT_SHEET } from '../item-sheet/sheet.tokens';
import { FreezerPage } from './freezer.page';

@Component({ template: 'settings' })
class SettingsStub {}

function inDays(n: number): string {
  const now = new Date();
  return todayLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
}

function item(over: Partial<ItemDto> & Pick<ItemDto, 'id' | 'name'>): ItemDto {
  return {
    category: 'meat',
    drawerId: 'drawer-1',
    quantity: 2,
    unit: 'piece',
    packSize: null,
    packUnit: null,
    frozenOn: inDays(-30),
    bestBefore: inDays(100),
    bestBeforeManual: false,
    notes: null,
    createdBy: 'thomas@example.com',
    updatedBy: 'thomas@example.com',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...over,
  };
}

function inventory(items: ItemDto[]): InventoryResponse {
  return {
    drawers: [
      { id: 'drawer-1', name: 'Top', position: 1 },
      { id: 'drawer-2', name: 'Middle', position: 2 },
    ],
    items,
    members: [{ email: 'thomas@example.com', displayName: 'Thomas' }],
    me: { email: 'thomas@example.com', displayName: 'Thomas' },
    suggestions: [],
    serverTime: '2026-11-05T10:00:00.000Z',
  };
}

const ITEMS = [
  item({ id: 'beef', name: 'Minced beef', bestBefore: inDays(100) }),
  item({ id: 'cod', name: 'Cod', category: 'fish', drawerId: 'drawer-2', bestBefore: inDays(5) }),
  item({ id: 'bread', name: 'Bread', category: 'bread', bestBefore: inDays(-2) }),
  item({ id: 'rice', name: 'Rice', category: 'other', unit: 'kg', quantity: 1.5, bestBefore: inDays(200) }),
];

describe('FreezerPage', () => {
  const theme = { mode: signal('system'), cycle: vi.fn() };
  const itemSheet = { open: vi.fn() };
  const takeOutSheet = { open: vi.fn() };
  let harness: RouterTestingHarness;
  let store: InventoryStore;
  let el: HTMLElement;

  async function setup(items: ItemDto[], url = '/') {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: FreezerPage },
          { path: 'settings', component: SettingsStub },
        ]),
        { provide: ApiClient, useValue: { get: async () => inventory(items), post: vi.fn() } },
        { provide: ThemeService, useValue: theme },
        { provide: ITEM_SHEET, useValue: itemSheet },
        { provide: TAKE_OUT_SHEET, useValue: takeOutSheet },
      ],
    });
    store = TestBed.inject(InventoryStore);
    await store.refresh();
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, FreezerPage);
    harness.detectChanges();
    el = harness.routeNativeElement as HTMLElement;
  }

  const names = () => [...el.querySelectorAll('app-item-card .name')].map((n) => n.textContent?.trim());
  const click = (selector: string) => {
    el.querySelector<HTMLElement>(selector)!.click();
    harness.detectChanges();
  };
  const chip = (label: string) =>
    [...el.querySelectorAll<HTMLElement>('app-category-chips button')].find(
      (b) => b.textContent?.trim() === label,
    )!;

  beforeEach(() => vi.clearAllMocks());

  it('shows the empty-freezer message for an empty store', async () => {
    await setup([]);
    expect(el.textContent).toContain('Your freezer is empty – tap + to add the first item.');
  });

  it('shows the no-match message for a search without results', async () => {
    await setup(ITEMS);
    store.search.set('xyz');
    harness.detectChanges();
    expect(el.textContent).toContain("Nothing matches 'xyz'.");
    expect(names()).toEqual([]);
  });

  it('filters by the typed search', async () => {
    await setup(ITEMS);
    const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'cod';
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(names()).toEqual(['Cod']);
  });

  it('hides the Use first strip when nothing is expiring', async () => {
    await setup([ITEMS[0]]);
    expect(el.querySelector('app-use-first-strip .tile')).toBeNull();
    expect(el.textContent).not.toContain('Use first');
  });

  it('shows the Use first strip with its count, expired first', async () => {
    await setup(ITEMS);
    const tiles = [...el.querySelectorAll('app-use-first-strip .tile')];
    expect(tiles.map((t) => t.querySelector('.name')?.textContent?.trim())).toEqual(['Bread', 'Cod']);
    expect(el.querySelector('app-use-first-strip .count')?.textContent?.trim()).toBe('2');
  });

  it('groups by drawer by default and by best-before date when toggled', async () => {
    await setup(ITEMS);
    expect(el.querySelectorAll('app-drawer-group').length).toBe(2);
    click('[data-grouping="date"]');
    expect(el.querySelectorAll('app-drawer-group').length).toBe(0);
    expect(names()).toEqual(['Bread', 'Cod', 'Minced beef', 'Rice']);
  });

  it('filters by category chip and clears with All', async () => {
    await setup(ITEMS);
    chip('Fish').click();
    harness.detectChanges();
    expect(names()).toEqual(['Cod']);
    expect(chip('Fish').getAttribute('aria-pressed')).toBe('true');
    chip('All').click();
    harness.detectChanges();
    expect(names().length).toBe(4);
  });

  it('cycles the theme from the top bar', async () => {
    await setup(ITEMS);
    click('.theme');
    expect(theme.cycle).toHaveBeenCalledOnce();
  });

  it('navigates to settings', async () => {
    await setup(ITEMS);
    click('.settings');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/settings');
  });

  it('opens the item sheet for a tapped card', async () => {
    await setup(ITEMS);
    click('app-item-card .main');
    expect(itemSheet.open).toHaveBeenCalledOnce();
    expect(itemSheet.open.mock.calls[0][0].id).toBeDefined();
  });

  it('takes one unit out of a counted item straight away', async () => {
    await setup(ITEMS);
    const spy = vi.spyOn(store, 'takeOut').mockResolvedValue({ deleted: false, item: ITEMS[0] });
    click('[aria-label="Take one Minced beef out"]');
    expect(spy).toHaveBeenCalledWith('beef');
    expect(takeOutSheet.open).not.toHaveBeenCalled();
  });

  it('opens the take-out sheet for a measured item', async () => {
    await setup(ITEMS);
    const spy = vi.spyOn(store, 'takeOut');
    click('[aria-label="Take one Rice out"]');
    expect(takeOutSheet.open).toHaveBeenCalledOnce();
    expect(takeOutSheet.open.mock.calls[0][0].id).toBe('rice');
    expect(spy).not.toHaveBeenCalled();
  });

  it('opens the item sheet once for /?add=1 and clears the param', async () => {
    await setup(ITEMS, '/?add=1');
    await harness.fixture.whenStable();
    expect(itemSheet.open).toHaveBeenCalledOnce();
    expect(itemSheet.open).toHaveBeenCalledWith();
    expect(TestBed.inject(Router).url).toBe('/');
  });
});
