import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DrawerDto, InventoryResponse } from '@shared/api-types';
import { version } from '../../../../package.json';
import { ApiClient } from '../../core/api.client';
import { InventoryStore } from '../../core/inventory.store';
import { ThemeService } from '../../core/theme.service';
import { SettingsPage } from './settings.page';

function drawers(n: number): DrawerDto[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `drawer-${i + 1}`,
    name: `Drawer ${i + 1}`,
    position: i + 1,
  }));
}

function inventory(drawerCount: number, itemInDrawer1: boolean): InventoryResponse {
  return {
    drawers: drawers(drawerCount),
    items: itemInDrawer1
      ? [
          {
            id: 'beef',
            name: 'Minced beef',
            category: 'meat',
            drawerId: 'drawer-1',
            quantity: 1,
            unit: 'piece',
            packSize: null,
            packUnit: null,
            frozenOn: '2026-10-01',
            bestBefore: '2026-11-10',
            bestBeforeManual: false,
            notes: null,
            createdBy: 'a@b.c',
            updatedBy: 'a@b.c',
            createdAt: '2026-11-01T10:00:00.000Z',
            updatedAt: '2026-11-01T10:00:00.000Z',
          },
        ]
      : [],
    members: [{ email: 'a@b.c', displayName: 'Anna' }],
    me: { email: 'a@b.c', displayName: 'Anna' },
    suggestions: [],
    serverTime: '2026-11-05T10:00:00.000Z',
  };
}

describe('SettingsPage', () => {
  const theme = { mode: signal('system'), setMode: vi.fn(), cycle: vi.fn() };
  let store: InventoryStore;
  let fixture: ReturnType<typeof TestBed.createComponent<SettingsPage>>;
  let el: HTMLElement;

  async function setup(drawerCount = 3, itemInDrawer1 = false) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ApiClient,
          useValue: {
            get: async () => inventory(drawerCount, itemInDrawer1),
            post: () => new Promise(() => undefined), // never settles: keeps optimistic rows pending
          },
        },
        { provide: ThemeService, useValue: theme },
      ],
    });
    store = TestBed.inject(InventoryStore);
    vi.spyOn(store, 'setDisplayName').mockResolvedValue();
    vi.spyOn(store, 'renameDrawer').mockResolvedValue();
    vi.spyOn(store, 'reorderDrawers').mockResolvedValue();
    vi.spyOn(store, 'createDrawer').mockResolvedValue();
    vi.spyOn(store, 'deleteDrawer').mockResolvedValue();
    await store.refresh();
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const type = (input: HTMLInputElement, value: string, event = 'input') => {
    input.value = value;
    input.dispatchEvent(new Event(event));
    fixture.detectChanges();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    theme.mode.set('system');
  });

  it('sets the theme mode from the radio group', async () => {
    await setup();
    const radios = [...el.querySelectorAll<HTMLInputElement>('input[name="theme"]')];
    expect(radios.map((r) => r.value)).toEqual(['system', 'light', 'dark']);
    expect(radios[0].checked).toBe(true);
    radios[2].click();
    expect(theme.setMode).toHaveBeenCalledWith('dark');
  });

  it('saves the display name through the store', async () => {
    await setup();
    const input = q<HTMLInputElement>('input.display-name');
    expect(input.value).toBe('Anna');
    expect(q<HTMLButtonElement>('button.save-name').disabled).toBe(true);
    type(input, '  Thomas ');
    q<HTMLButtonElement>('button.save-name').click();
    expect(store.setDisplayName).toHaveBeenCalledWith('Thomas');
  });

  it('renames a drawer', async () => {
    await setup();
    type(el.querySelectorAll<HTMLInputElement>('input.drawer-name')[1], 'Freezer door', 'change');
    expect(store.renameDrawer).toHaveBeenCalledWith('drawer-2', 'Freezer door');
  });

  it('renames once when Enter is followed by blur', async () => {
    await setup();
    const input = el.querySelectorAll<HTMLInputElement>('input.drawer-name')[1];
    input.value = 'Door';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    input.dispatchEvent(new Event('change'));
    input.dispatchEvent(new Event('blur'));
    expect(store.renameDrawer).toHaveBeenCalledTimes(1);
  });

  it('restores the drawer name when the rename is rejected', async () => {
    await setup();
    vi.mocked(store.renameDrawer).mockRejectedValue(new Error('x'));
    const input = el.querySelectorAll<HTMLInputElement>('input.drawer-name')[1];
    type(input, 'Door', 'change');
    await Promise.resolve();
    await Promise.resolve();
    expect(input.value).toBe('Drawer 2');
  });

  it('restores the display name when saving is rejected', async () => {
    await setup();
    vi.mocked(store.setDisplayName).mockRejectedValue(new Error('x'));
    const input = q<HTMLInputElement>('input.display-name');
    type(input, 'Thomas');
    q<HTMLButtonElement>('button.save-name').click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(input.value).toBe('Anna');
  });

  it('reorders drawers with the up and down buttons', async () => {
    await setup();
    q<HTMLButtonElement>('button[aria-label="Move Drawer 2 up"]').click();
    expect(store.reorderDrawers).toHaveBeenCalledWith(['drawer-2', 'drawer-1', 'drawer-3']);
    q<HTMLButtonElement>('button[aria-label="Move Drawer 1 down"]').click();
    expect(store.reorderDrawers).toHaveBeenLastCalledWith(['drawer-2', 'drawer-1', 'drawer-3']);
    expect(q<HTMLButtonElement>('button[aria-label="Move Drawer 1 up"]').disabled).toBe(true);
    expect(q<HTMLButtonElement>('button[aria-label="Move Drawer 3 down"]').disabled).toBe(true);
  });

  it('adds a drawer', async () => {
    await setup();
    const add = q<HTMLButtonElement>('button.add-drawer');
    expect(add.disabled).toBe(true);
    type(q<HTMLInputElement>('input.new-drawer'), ' Garage ');
    expect(add.disabled).toBe(false);
    add.click();
    expect(store.createDrawer).toHaveBeenCalledWith('Garage');
  });

  it('disables Add at 10 drawers', async () => {
    await setup(10);
    type(q<HTMLInputElement>('input.new-drawer'), 'Garage');
    expect(q<HTMLButtonElement>('button.add-drawer').disabled).toBe(true);
  });

  it('removes an empty drawer directly', async () => {
    await setup();
    q<HTMLButtonElement>('button[aria-label="Remove Drawer 2"]').click();
    fixture.detectChanges();
    expect(store.deleteDrawer).toHaveBeenCalledWith('drawer-2');
    expect(el.querySelector('select')).toBeNull();
  });

  it('asks for a target drawer when the drawer holds items', async () => {
    await setup(3, true);
    q<HTMLButtonElement>('button[aria-label="Remove Drawer 1"]').click();
    fixture.detectChanges();
    expect(store.deleteDrawer).not.toHaveBeenCalled();
    const select = q<HTMLSelectElement>('select.move-to');
    expect([...select.options].map((o) => o.value)).toEqual(['drawer-2', 'drawer-3']);
    select.value = 'drawer-3';
    select.dispatchEvent(new Event('change'));
    q<HTMLButtonElement>('button.confirm-remove').click();
    fixture.detectChanges();
    expect(store.deleteDrawer).toHaveBeenCalledWith('drawer-1', 'drawer-3');
    expect(el.querySelector('select')).toBeNull();
  });

  it('defaults the target to the first other drawer and can be cancelled', async () => {
    await setup(3, true);
    q<HTMLButtonElement>('button[aria-label="Remove Drawer 1"]').click();
    fixture.detectChanges();
    q<HTMLButtonElement>('button.confirm-remove').click();
    expect(store.deleteDrawer).toHaveBeenCalledWith('drawer-1', 'drawer-2');

    vi.mocked(store.deleteDrawer).mockClear();
    q<HTMLButtonElement>('button[aria-label="Remove Drawer 1"]').click();
    fixture.detectChanges();
    q<HTMLButtonElement>('button.cancel-remove').click();
    fixture.detectChanges();
    expect(store.deleteDrawer).not.toHaveBeenCalled();
    expect(el.querySelector('select')).toBeNull();
  });

  it('disables Remove when one drawer is left', async () => {
    await setup(1);
    expect(q<HTMLButtonElement>('button[aria-label="Remove Drawer 1"]').disabled).toBe(true);
  });

  it('disables rename, move and remove on a drawer that is still being created', async () => {
    await setup();
    vi.mocked(store.createDrawer).mockRestore();
    void store.createDrawer('Door');
    fixture.detectChanges();
    const rows = el.querySelectorAll<HTMLLIElement>('.drawers li');
    const pending = rows[rows.length - 1];
    expect(pending.querySelector<HTMLInputElement>('input.drawer-name')!.value).toBe('Door');
    expect(pending.querySelector<HTMLInputElement>('input.drawer-name')!.disabled).toBe(true);
    pending.querySelectorAll<HTMLButtonElement>('button').forEach((b) => expect(b.disabled).toBe(true));
    expect(rows[0].querySelector<HTMLInputElement>('input.drawer-name')!.disabled).toBe(false);
  });

  it('shows the app version from package.json', async () => {
    await setup();
    expect(el.textContent).toContain(`Version ${version}`);
  });

  it('disables every drawer and name mutation while offline', async () => {
    const spy = vi.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
    try {
      await setup();
      type(q<HTMLInputElement>('input.display-name'), 'Thomas');
      type(q<HTMLInputElement>('input.new-drawer'), 'Door');
      expect(q<HTMLButtonElement>('button.save-name').disabled).toBe(true);
      expect(q<HTMLButtonElement>('button.add-drawer').disabled).toBe(true);
      const mutating = el.querySelectorAll<HTMLButtonElement>('.drawers button');
      expect(mutating.length).toBeGreaterThan(0);
      mutating.forEach((b) => expect(b.disabled).toBe(true));
      el.querySelectorAll<HTMLInputElement>('input.drawer-name').forEach((i) => expect(i.disabled).toBe(true));
    } finally {
      spy.mockRestore();
    }
  });
});
