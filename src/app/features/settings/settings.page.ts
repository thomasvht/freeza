import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import type { DrawerDto } from '@shared/api-types';
import { DISPLAY_NAME_MAX, DRAWER_NAME_MAX, MAX_ACTIVE_DRAWERS } from '@shared/item-rules';
import { LucideArrowDown, LucideArrowUp, LucideTrash2 } from '@lucide/angular';
import { version } from '../../../../package.json';
import { ConnectivityService } from '../../core/connectivity.service';
import { InventoryStore, isPendingDrawer } from '../../core/inventory.store';
import { ThemeService, type ThemeMode } from '../../core/theme.service';
import { fill, S } from '../../strings';
import { Sheet } from '../../ui/sheet/sheet';

@Component({
  selector: 'app-settings-page',
  imports: [Sheet, LucideArrowDown, LucideArrowUp, LucideTrash2],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  protected readonly store = inject(InventoryStore);
  protected readonly theme = inject(ThemeService);
  protected readonly online = inject(ConnectivityService).online;

  protected readonly s = S.settings;
  protected readonly title = S.pages.settings;
  protected readonly versionLabel = fill(S.settings.version, { version });
  protected readonly displayNameMax = DISPLAY_NAME_MAX;
  protected readonly drawerNameMax = DRAWER_NAME_MAX;
  protected readonly themes: { mode: ThemeMode; label: string }[] = [
    { mode: 'system', label: S.freezer.themeModes.system },
    { mode: 'light', label: S.freezer.themeModes.light },
    { mode: 'dark', label: S.freezer.themeModes.dark },
  ];

  protected readonly name = linkedSignal(() => this.store.me()?.displayName ?? '');
  protected readonly canSaveName = computed(() => {
    const name = this.name().trim();
    return this.online() && name !== '' && name !== this.store.me()?.displayName;
  });

  protected readonly newDrawer = signal('');
  protected readonly canAdd = computed(
    () => this.online() && this.newDrawer().trim() !== '' && this.store.drawers().length < MAX_ACTIVE_DRAWERS,
  );

  protected readonly sorted = computed(() =>
    [...this.store.drawers()].sort((a, b) => a.position - b.position),
  );
  protected readonly onlyOne = computed(() => this.sorted().length <= 1);

  /** The drawer being removed while its items need a new home. */
  protected readonly removing = signal<DrawerDto | null>(null);
  protected readonly targets = computed(() => this.sorted().filter((d) => d.id !== this.removing()?.id));
  protected readonly target = linkedSignal(() => this.targets()[0]?.id ?? '');
  protected readonly removeTitle = computed(() =>
    fill(S.settings.removeTitle, { name: this.removing()?.name ?? '' }),
  );

  /** Optimistic row the server has not confirmed: it has no real id to rename, move or remove yet. */
  protected pending(drawer: DrawerDto): boolean {
    return isPendingDrawer(drawer.id);
  }

  protected label(template: string, drawer: DrawerDto): string {
    return fill(template, { name: drawer.name });
  }

  protected saveName(): void {
    if (!this.canSaveName()) return;
    this.run(this.store.setDisplayName(this.name().trim()), () =>
      this.name.set(this.store.me()?.displayName ?? ''),
    );
  }

  protected rename(drawer: DrawerDto, input: HTMLInputElement): void {
    if (!this.online() || this.pending(drawer)) return;
    const name = input.value.trim();
    if (name === '' || name === drawer.name) {
      input.value = drawer.name;
      return;
    }
    this.run(this.store.renameDrawer(drawer.id, name), () => {
      input.value = this.store.drawers().find((d) => d.id === drawer.id)?.name ?? drawer.name;
    });
  }

  protected move(index: number, by: -1 | 1): void {
    if (!this.online() || this.pending(this.sorted()[index])) return;
    const ids = this.sorted().map((d) => d.id);
    const swap = index + by;
    if (swap < 0 || swap >= ids.length) return;
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
    this.run(this.store.reorderDrawers(ids));
  }

  protected add(): void {
    if (!this.canAdd()) return;
    const name = this.newDrawer().trim();
    this.newDrawer.set('');
    this.run(this.store.createDrawer(name));
  }

  protected remove(drawer: DrawerDto): void {
    if (!this.online() || this.onlyOne() || this.pending(drawer)) return;
    if (this.store.items().some((i) => i.drawerId === drawer.id)) this.removing.set(drawer);
    else this.run(this.store.deleteDrawer(drawer.id));
  }

  protected confirmRemove(): void {
    const drawer = this.removing();
    const target = this.target();
    if (!drawer || !target || !this.online()) return;
    this.removing.set(null);
    this.run(this.store.deleteDrawer(drawer.id, target));
  }

  /** The store already toasts a failure; this only stops it surfacing as an unhandled rejection. */
  private run(promise: Promise<unknown>, onError?: () => void): void {
    promise.catch(() => onError?.());
  }
}
