import { TestBed } from '@angular/core/testing';
import type { DrawerDto, InventoryResponse, ItemDto } from '@shared/api-types';
import { todayLocal } from '@shared/dates';
import { ApiClient, ApiError } from './api.client';
import { ONLINE_PROBE } from './connectivity.service';
import { RELOAD_PAGE, SessionService } from './session.service';
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

/** Each response is a second newer than the last, like a live server. */
let serverClock = 0;
function nextServerTime(): string {
  return new Date(Date.UTC(2026, 10, 5, 10) + ++serverClock * 1000).toISOString();
}

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
    serverTime: nextServerTime(),
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

  it('ignores a response older than the last applied one (a stale service-worker copy)', async () => {
    const applied = store.items().length;
    const stale = { ...inventory(), items: [], serverTime: '2026-11-05T09:00:00.000Z' };
    api.get.mockResolvedValueOnce(stale);
    await store.refresh();
    expect(store.items()).toHaveLength(applied);
  });

  it('ignores a replayed response with the same serverTime', async () => {
    const first = inventory();
    api.get.mockResolvedValueOnce(first);
    await store.refresh();
    api.get.mockResolvedValueOnce({ ...first, items: [] });
    await store.refresh();
    expect(store.items()).toHaveLength(first.items.length);
  });

  it('keeps the newer of two overlapping refreshes that resolve out of order', async () => {
    const older = deferred<InventoryResponse>();
    const newer = deferred<InventoryResponse>();
    api.get.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const a = store.refresh();
    const b = store.refresh();
    const olderBody = { ...inventory(), items: [] };
    const newerBody = inventory();
    newer.resolve(newerBody);
    await b;
    older.resolve(olderBody);
    await a;
    expect(store.items()).toHaveLength(newerBody.items.length);
  });

  it('flags a failed first load (not a session expiry) and clears it on success', async () => {
    TestBed.resetTestingModule();
    api = fakeApi();
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
    store = TestBed.inject(InventoryStore);
    expect(store.loadFailed()).toBe(false);
    api.get.mockRejectedValueOnce(new ApiError(0, 'session_expired', 'x'));
    await expect(store.refresh()).rejects.toBeInstanceOf(ApiError);
    expect(store.loadFailed()).toBe(false);
    api.get.mockRejectedValueOnce(new ApiError(500, 'internal', 'boom'));
    await expect(store.refresh()).rejects.toBeInstanceOf(ApiError);
    expect(store.loadFailed()).toBe(true);
    await store.refresh();
    expect(store.loadFailed()).toBe(false);
    expect(store.loaded()).toBe(true);
  });

  it('moves today past midnight on a poll tick and on becoming visible, even when the refresh fails', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date(2026, 10, 5, 23, 59, 50));
    api.get.mockRejectedValue(new ApiError(0, 'network', 'down'));
    store.startPolling();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.today()).toBe('2026-11-05');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.today()).toBe('2026-11-06');

    vi.setSystemTime(new Date(2026, 10, 7, 0, 0, 5)); // the next midnight passes between ticks
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.today()).toBe('2026-11-06');
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.today()).toBe('2026-11-07');
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

describe('InventoryStore polling, offline and session expiry', () => {
  let api: ReturnType<typeof fakeApi>;
  let store: InventoryStore;
  let onLine: boolean;

  beforeEach(async () => {
    onLine = true;
    api = fakeApi();
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiClient, useValue: api },
        { provide: ONLINE_PROBE, useValue: () => onLine },
        { provide: RELOAD_PAGE, useValue: () => undefined },
      ],
    });
    store = TestBed.inject(InventoryStore);
    await store.refresh();
    vi.useFakeTimers();
    store.startPolling();
    await vi.advanceTimersByTimeAsync(0);
    api.get.mockClear();
  });

  afterEach(() => {
    store.stopPolling();
    vi.useRealTimers();
  });

  it('skips polling while offline and refreshes once when back online', async () => {
    onLine = false;
    window.dispatchEvent(new Event('offline'));
    await vi.advanceTimersByTimeAsync(90_000);
    expect(api.get).not.toHaveBeenCalled();

    onLine = true;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('stops polling once the session has expired', async () => {
    TestBed.inject(SessionService).markExpired();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('refuses every mutation while offline, with the offline toast and no API call', async () => {
    onLine = false;
    const toast = TestBed.inject(ToastService);
    const peas = store.items()[0];
    for (const run of [
      () => store.updateItem(peas.id, { name: 'X' }),
      () => store.restoreItem(peas),
      () => store.takeOut(peas.id),
      () => store.createDrawer('Door'),
    ]) {
      toast.dismiss();
      await expect(run()).rejects.toMatchObject({ code: 'network' });
      expect(toast.current()?.message).toBe('Offline – changes are disabled');
    }
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
