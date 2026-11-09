import { computed, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import type {
  CreateItemBody,
  DrawerDto,
  InventoryResponse,
  ItemDto,
  MemberDto,
  PatchItemBody,
  SuggestionDto,
} from '@shared/api-types';
import type { CategoryKey } from '@shared/categories';
import { daysBetween, todayLocal, type IsoDate } from '@shared/dates';
import { expiryStatus, type ExpiryStatus } from '@shared/expiry';
import { S } from '../strings';
import { ApiClient, ApiError } from './api.client';
import { ConnectivityService } from './connectivity.service';
import { SessionService } from './session.service';
import { ToastService } from './toast.service';

export type ItemView = ItemDto & {
  status: ExpiryStatus;
  daysLeft: number;
  drawerName: string;
  addedByName: string;
};

export type Grouping = 'drawer' | 'date';

const POLL_MS = 30_000;

/** Id prefix of a drawer the server has not confirmed yet. */
export const PENDING_DRAWER_PREFIX = 'pending-';

export function isPendingDrawer(id: string): boolean {
  return id.startsWith(PENDING_DRAWER_PREFIX);
}

interface Snapshot {
  drawers: DrawerDto[];
  items: ItemDto[];
  members: MemberDto[];
  me: MemberDto | null;
}

/** Household inventory state. Mutations are optimistic, with rollback and a toast on failure. */
@Injectable({ providedIn: 'root' })
export class InventoryStore {
  private readonly api = inject(ApiClient);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly connectivity = inject(ConnectivityService);
  private readonly session = inject(SessionService);

  private readonly _drawers = signal<DrawerDto[]>([]);
  private readonly _items = signal<ItemDto[]>([]);
  private readonly _members = signal<MemberDto[]>([]);
  private readonly _me = signal<MemberDto | null>(null);
  private readonly _suggestions = signal<SuggestionDto[]>([]);
  private readonly _loaded = signal(false);
  private readonly _today = signal<IsoDate>(todayLocal());
  private readonly _loadFailed = signal(false);

  readonly drawers = this._drawers.asReadonly();
  readonly items = this._items.asReadonly();
  readonly members = this._members.asReadonly();
  readonly me = this._me.asReadonly();
  readonly suggestions = this._suggestions.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly today = this._today.asReadonly();
  /** The first load failed for a reason other than an expired session; the page offers a retry. */
  readonly loadFailed = this._loadFailed.asReadonly();

  readonly search = signal('');
  readonly category = signal<CategoryKey | null>(null);
  readonly grouping = signal<Grouping>('drawer');

  readonly itemViews = computed<ItemView[]>(() => {
    const today = this._today();
    const drawerNames = new Map(this._drawers().map((d) => [d.id, d.name]));
    const memberNames = new Map(this._members().map((m) => [m.email, m.displayName]));
    return this._items().map((item) => ({
      ...item,
      status: expiryStatus(item.bestBefore, today),
      daysLeft: daysBetween(today, item.bestBefore),
      drawerName: drawerNames.get(item.drawerId) ?? '',
      addedByName: memberNames.get(item.createdBy) ?? item.createdBy.split('@')[0],
    }));
  });

  readonly filteredItems = computed<ItemView[]>(() => {
    const q = this.search().trim().toLowerCase();
    const category = this.category();
    return this.itemViews()
      .filter((i) => category === null || i.category === category)
      .filter(
        (i) => q === '' || i.name.toLowerCase().includes(q) || (i.notes ?? '').toLowerCase().includes(q),
      )
      .sort(byBestBefore);
  });

  /** Expired, then use-soon. Ignores search and category. */
  readonly useFirst = computed<ItemView[]>(() =>
    this.itemViews()
      .filter((i) => i.status !== 'fresh')
      .sort((a, b) => statusRank(a.status) - statusRank(b.status) || byBestBefore(a, b)),
  );

  /** Every drawer in position order, empty ones included, with the filtered items. */
  readonly groups = computed<{ drawer: DrawerDto; items: ItemView[] }[]>(() => {
    const items = this.filteredItems();
    return [...this._drawers()]
      .sort((a, b) => a.position - b.position)
      .map((drawer) => ({ drawer, items: items.filter((i) => i.drawerId === drawer.id) }));
  });

  private pending = 0;
  private mutationSeq = 0;
  private refreshAfterRollback = false;
  /** `serverTime` of the last applied inventory; older or equal responses are dropped. */
  private appliedServerTime: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private readonly onVisibilityChange = () => {
    if (!this.isVisible()) return;
    this._today.set(todayLocal());
    this.refreshQuietly();
  };
  private readonly onOnline = () => this.refreshQuietly();

  async refresh(): Promise<void> {
    const seq = this.mutationSeq;
    let res: InventoryResponse;
    try {
      res = await this.api.get<InventoryResponse>('/inventory');
    } catch (e) {
      if (!this._loaded()) this._loadFailed.set(!(e instanceof ApiError && e.code === 'session_expired'));
      throw e;
    }
    // Drop a response that would overwrite an optimistic change made while it was in flight.
    if (this.pending > 0 || seq !== this.mutationSeq) return;
    // Drop a response no newer than the applied one: a stale service-worker copy on a slow network, or an
    // older refresh that resolved after a newer one. The first load is always applied (offline start).
    if (this.appliedServerTime !== null && res.serverTime <= this.appliedServerTime) return;
    this.appliedServerTime = res.serverTime;
    this._loadFailed.set(false);
    this._drawers.set(res.drawers);
    this._items.set(res.items);
    this._members.set(res.members);
    this._me.set(res.me);
    this._suggestions.set(res.suggestions);
    this._today.set(todayLocal());
    this._loaded.set(true);
  }

  startPolling(): void {
    if (this.pollTimer !== undefined) return;
    this.tick();
    this.pollTimer = setInterval(() => this.tick(), POLL_MS);
    this.document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.document.defaultView?.addEventListener('online', this.onOnline);
  }

  stopPolling(): void {
    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.document.defaultView?.removeEventListener('online', this.onOnline);
  }

  // ---------- items ----------

  async createItem(body: CreateItemBody): Promise<void> {
    const email = this._me()?.email ?? '';
    const now = new Date().toISOString();
    const optimistic: ItemDto = { ...body, createdBy: email, updatedBy: email, createdAt: now, updatedAt: now };
    await this.mutate(
      () => this._items.update((items) => [...items, optimistic]),
      async () => {
        const saved = await this.api.post<ItemDto>('/items', body);
        this.replaceItem(saved);
      },
    );
  }

  async updateItem(id: string, patch: PatchItemBody): Promise<void> {
    await this.mutate(
      () => this._items.update((items) => items.map((i) => (i.id === id ? { ...i, ...patch } : i))),
      async () => {
        const saved = await this.api.patch<ItemDto>(`/items/${id}`, patch);
        this.replaceItem(saved);
      },
    );
  }

  async takeOut(id: string, amount?: number): Promise<{ deleted: boolean; item: ItemDto }> {
    const take = amount ?? 1;
    return this.mutate(
      () =>
        this._items.update((items) =>
          items.flatMap((i) => {
            if (i.id !== id) return [i];
            const quantity = round(i.quantity - take);
            return quantity <= 0 ? [] : [{ ...i, quantity }];
          }),
        ),
      async () => {
        const res = await this.api.post<{ deleted?: boolean; item: ItemDto }>(`/items/${id}/take`, {
          amount: take,
        });
        const deleted = res.deleted === true;
        if (deleted) this._items.update((items) => items.filter((i) => i.id !== id));
        else this.replaceItem(res.item);
        return { deleted, item: res.item };
      },
    );
  }

  async deleteItem(id: string): Promise<ItemDto> {
    const item = this._items().find((i) => i.id === id);
    if (!item) throw new ApiError(404, 'not_found', 'Item not found');
    await this.mutate(
      () => this._items.update((items) => items.filter((i) => i.id !== id)),
      () => this.api.delete(`/items/${id}`),
    );
    return item;
  }

  async restoreItem(item: ItemDto, quantity?: number): Promise<void> {
    const restored = quantity === undefined ? item : { ...item, quantity };
    await this.mutate(
      () => this._items.update((items) => [...items.filter((i) => i.id !== item.id), restored]),
      async () => {
        const saved = await this.api.post<ItemDto>(
          `/items/${item.id}/restore`,
          quantity === undefined ? {} : { quantity },
        );
        this.replaceItem(saved);
      },
    );
  }

  // ---------- drawers ----------

  async createDrawer(name: string): Promise<void> {
    const tempId = `${PENDING_DRAWER_PREFIX}${crypto.randomUUID()}`;
    const position = Math.max(0, ...this._drawers().map((d) => d.position)) + 1;
    await this.mutate(
      () => this._drawers.update((drawers) => [...drawers, { id: tempId, name, position }]),
      async () => {
        const saved = await this.api.post<DrawerDto>('/drawers', { name });
        this._drawers.update((drawers) => drawers.map((d) => (d.id === tempId ? saved : d)));
      },
    );
  }

  async renameDrawer(id: string, name: string): Promise<void> {
    await this.mutate(
      () => this._drawers.update((drawers) => drawers.map((d) => (d.id === id ? { ...d, name } : d))),
      async () => {
        const saved = await this.api.patch<DrawerDto>(`/drawers/${id}`, { name });
        this._drawers.update((drawers) => drawers.map((d) => (d.id === id ? saved : d)));
      },
    );
  }

  async reorderDrawers(ids: string[]): Promise<void> {
    await this.mutate(
      () =>
        this._drawers.update((drawers) =>
          drawers.map((d) => (ids.includes(d.id) ? { ...d, position: ids.indexOf(d.id) + 1 } : d)),
        ),
      async () => {
        const saved = await this.api.put<DrawerDto[]>('/drawers/order', { ids });
        this._drawers.set(saved);
      },
    );
  }

  async deleteDrawer(id: string, moveTo?: string): Promise<void> {
    const query = moveTo === undefined ? '' : `?moveTo=${encodeURIComponent(moveTo)}`;
    await this.mutate(
      () => {
        this._drawers.update((drawers) => drawers.filter((d) => d.id !== id));
        if (moveTo !== undefined) {
          this._items.update((items) => items.map((i) => (i.drawerId === id ? { ...i, drawerId: moveTo } : i)));
        }
      },
      () => this.api.delete(`/drawers/${id}${query}`),
    );
  }

  // ---------- me ----------

  async setDisplayName(name: string): Promise<void> {
    const email = this._me()?.email;
    const rename = (m: MemberDto) => (m.email === email ? { ...m, displayName: name } : m);
    await this.mutate(
      () => {
        this._me.update((me) => (me ? rename(me) : me));
        this._members.update((members) => members.map(rename));
      },
      async () => {
        const saved = await this.api.patch<MemberDto>('/me', { displayName: name });
        this._me.set(saved);
        this._members.update((members) => members.map((m) => (m.email === saved.email ? saved : m)));
      },
    );
  }

  // ---------- internals ----------

  /** Applies `optimistic`, runs `call`; on failure restores the snapshot, toasts, refreshes and rethrows. */
  private async mutate<T>(optimistic: () => void, call: () => Promise<T>): Promise<T> {
    if (!this.connectivity.isOnline()) {
      this.toast.show({ message: S.status.offline });
      throw new ApiError(0, 'network', S.status.offline);
    }
    const snapshot = this.snapshot();
    this.mutationSeq++;
    this.pending++;
    optimistic();
    try {
      const result = await call();
      this.pending--;
      if (this.pending === 0 && this.refreshAfterRollback) {
        this.refreshAfterRollback = false;
        this.refreshQuietly();
      }
      return result;
    } catch (e) {
      this.pending--;
      this.restore(snapshot);
      this.toast.show({ message: errorMessage(e) });
      if (this.pending === 0) {
        this.refreshAfterRollback = false;
        await this.refresh().catch(() => undefined);
      } else {
        // The snapshot may undo another in-flight mutation (e.g. resurrect a deleted row), and a refresh
        // now would be dropped; refresh once the last mutation settles.
        this.refreshAfterRollback = true;
      }
      throw e;
    }
  }

  private snapshot(): Snapshot {
    return { drawers: this._drawers(), items: this._items(), members: this._members(), me: this._me() };
  }

  private restore(s: Snapshot): void {
    this._drawers.set(s.drawers);
    this._items.set(s.items);
    this._members.set(s.members);
    this._me.set(s.me);
  }

  private replaceItem(saved: ItemDto): void {
    this._items.update((items) =>
      items.some((i) => i.id === saved.id)
        ? items.map((i) => (i.id === saved.id ? saved : i))
        : [...items, saved],
    );
  }

  /** A poll tick: `today` moves on (e.g. past midnight) whether or not the refresh succeeds. */
  private tick(): void {
    this._today.set(todayLocal());
    if (this.isVisible()) this.refreshQuietly();
  }

  private refreshQuietly(): void {
    // No calls while offline (the `online` event refreshes once) or once the session has expired.
    if (!this.connectivity.isOnline() || this.session.expired()) return;
    // Polling failures are silent; the next tick or a mutation retries.
    this.refresh().catch(() => undefined);
  }

  private isVisible(): boolean {
    return this.document.visibilityState === 'visible';
  }
}

function byBestBefore(a: ItemView, b: ItemView): number {
  return a.bestBefore.localeCompare(b.bestBefore) || a.name.localeCompare(b.name);
}

function statusRank(s: ExpiryStatus): number {
  return s === 'expired' ? 0 : s === 'use-soon' ? 1 : 2;
}

/** Avoids float drift such as 0.30000000000000004 after a take-out. */
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return S.errors[e.code] ?? S.errors.generic;
  return S.errors.generic;
}
