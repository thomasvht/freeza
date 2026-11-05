import { TestBed } from '@angular/core/testing';
import type { DrawerDto, InventoryResponse, ItemDto } from '@shared/api-types';
import { todayLocal } from '@shared/dates';
import { ApiClient, ApiError } from './api.client';
import { InventoryStore } from './inventory.store';
import { ToastService } from './toast.service';

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

const DRAWERS: DrawerDto[] = [
  { id: 'drawer-3', name: 'Bottom', position: 3 },
  { id: 'drawer-1', name: 'Top', position: 1 },
  { id: 'drawer-2', name: 'Middle', position: 2 },
];

function inventory(): InventoryResponse {
  return {
    drawers: DRAWERS,
    items: [
      item({ id: 'beef', name: 'Minced beef', bestBefore: inDays(100) }),
      item({ id: 'peas', name: 'Peas', category: 'veg', bestBefore: inDays(5), drawerId: 'drawer-3' }),
      item({ id: 'bread', name: 'Bread', category: 'bread', bestBefore: inDays(-2) }),
    ],
    members: [{ email: 'thomas@example.com', displayName: 'Thomas' }],
    me: { email: 'thomas@example.com', displayName: 'Thomas' },
    suggestions: [],
    serverTime: '2026-11-05T10:00:00.000Z',
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeApi() {
  return {
    get: vi.fn(async () => inventory()),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

describe('InventoryStore', () => {
  let api: ReturnType<typeof fakeApi>;
  let store: InventoryStore;

  beforeEach(async () => {
    api = fakeApi();
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
    store = TestBed.inject(InventoryStore);
    await store.refresh();
  });

  afterEach(() => {
    store.stopPolling();
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('builds item views with status, drawer and member names', () => {
    const peas = store.itemViews().find((i) => i.id === 'peas')!;
    expect(peas.status).toBe('use-soon');
    expect(peas.daysLeft).toBe(5);
    expect(peas.drawerName).toBe('Bottom');
    expect(peas.addedByName).toBe('Thomas');
  });

  it('falls back to the email local part for unknown members', async () => {
    api.get.mockResolvedValueOnce({
      ...inventory(),
      items: [item({ id: 'x', name: 'X', createdBy: 'ann@example.com' })],
    });
    await store.refresh();
    expect(store.itemViews()[0].addedByName).toBe('ann');
  });

  it('filters by search and category, sorted by best before', () => {
    expect(store.filteredItems().map((i) => i.id)).toEqual(['bread', 'peas', 'beef']);
    store.search.set('PEA');
    expect(store.filteredItems().map((i) => i.id)).toEqual(['peas']);
    store.search.set('');
    store.category.set('bread');
    expect(store.filteredItems().map((i) => i.id)).toEqual(['bread']);
  });

  it('useFirst ignores the search and the category', () => {
    store.search.set('beef');
    store.category.set('meat');
    expect(store.useFirst().map((i) => i.id)).toEqual(['bread', 'peas']);
  });

  it('groups include empty drawers, in position order', () => {
    store.search.set('peas');
    const groups = store.groups();
    expect(groups.map((g) => g.drawer.id)).toEqual(['drawer-1', 'drawer-2', 'drawer-3']);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([[], [], ['peas']]);
  });

  it('takeOut is optimistic', async () => {
    const call = deferred<{ item: ItemDto }>();
    api.post.mockReturnValueOnce(call.promise);

    const result = store.takeOut('beef');
    expect(store.items().find((i) => i.id === 'beef')!.quantity).toBe(1);
    expect(api.post).toHaveBeenCalledWith('/items/beef/take', { amount: 1 });

    call.resolve({ item: item({ id: 'beef', name: 'Minced beef', quantity: 1 }) });
    await expect(result).resolves.toEqual({
      deleted: false,
      item: expect.objectContaining({ id: 'beef', quantity: 1 }),
    });
  });

  it('takeOut removes the item when the server deletes it', async () => {
    const gone = item({ id: 'beef', name: 'Minced beef', quantity: 0 });
    api.post.mockResolvedValueOnce({ deleted: true, item: gone });
    await expect(store.takeOut('beef', 2)).resolves.toEqual({ deleted: true, item: gone });
    expect(store.items().some((i) => i.id === 'beef')).toBe(false);
  });

  it('updateItem that gets a 404 restores the item, shows a toast and refreshes', async () => {
    const before = store.items().find((i) => i.id === 'beef');
    const call = deferred<ItemDto>();
    api.patch.mockReturnValueOnce(call.promise);

    const result = store.updateItem('beef', { name: 'Steak' });
    expect(store.items().find((i) => i.id === 'beef')!.name).toBe('Steak');

    call.reject(new ApiError(404, 'not_found', 'Item not found'));
    await expect(result).rejects.toBeInstanceOf(ApiError);
    expect(store.items().find((i) => i.id === 'beef')).toEqual(before);
    expect(TestBed.inject(ToastService).current()?.message).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('refreshes once the last in-flight mutation settles after a rollback', async () => {
    const update = deferred<ItemDto>();
    const del = deferred<void>();
    api.patch.mockReturnValueOnce(update.promise);
    api.delete.mockReturnValueOnce(del.promise);

    const updating = store.updateItem('beef', { name: 'Steak' }); // snapshot still holds peas
    const deleting = store.deleteItem('peas');

    update.reject(new ApiError(404, 'not_found', 'Item not found'));
    await expect(updating).rejects.toBeInstanceOf(ApiError);
    expect(api.get).toHaveBeenCalledTimes(1); // no refresh while the delete is in flight

    const fresh = inventory();
    api.get.mockResolvedValueOnce({ ...fresh, items: fresh.items.filter((i) => i.id !== 'peas') });
    del.resolve();
    await deleting;
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(store.items().some((i) => i.id === 'peas')).toBe(false));
  });

  it('polls every 30 s while visible, not while hidden, and on becoming visible', async () => {
    vi.useFakeTimers();
    store.startPolling();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.get).toHaveBeenCalledTimes(2); // beforeEach + startPolling

    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.get).toHaveBeenCalledTimes(3);

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.get).toHaveBeenCalledTimes(3);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.get).toHaveBeenCalledTimes(4);

    store.stopPolling();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.get).toHaveBeenCalledTimes(4);
  });
});
