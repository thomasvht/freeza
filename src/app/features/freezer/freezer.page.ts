import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CategoryKey } from '@shared/categories';
import { isCountedUnit } from '@shared/units';
import {
  LucideDynamicIcon,
  LucideMonitor,
  LucideMoon,
  LucideSearch,
  LucideSettings,
  LucideSnowflake,
  LucideSun,
} from '@lucide/angular';
import { InventoryStore, type Grouping, type ItemView } from '../../core/inventory.store';
import { ThemeService, type ThemeMode } from '../../core/theme.service';
import { fill, S } from '../../strings';
import { EmptyState } from '../../ui/empty-state/empty-state';
import { ITEM_SHEET, TAKE_OUT_SHEET } from '../item-sheet/sheet.tokens';
import { CategoryChips } from './category-chips/category-chips';
import { DrawerGroup } from './drawer-group/drawer-group';
import { ItemCardComponent } from './item-card/item-card';
import { UseFirstStrip } from './use-first-strip/use-first-strip';

const THEME_ICONS = { system: LucideMonitor, light: LucideSun, dark: LucideMoon } as const;

@Component({
  selector: 'app-freezer-page',
  imports: [
    RouterLink,
    LucideDynamicIcon,
    LucideSearch,
    LucideSettings,
    LucideSnowflake,
    CategoryChips,
    DrawerGroup,
    EmptyState,
    ItemCardComponent,
    UseFirstStrip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './freezer.page.html',
  styleUrl: './freezer.page.scss',
})
export class FreezerPage {
  protected readonly store = inject(InventoryStore);
  protected readonly theme = inject(ThemeService);
  private readonly itemSheet = inject(ITEM_SHEET);
  private readonly takeOutSheet = inject(TAKE_OUT_SHEET);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly s = S.freezer;
  protected readonly appName = S.appName;
  protected readonly settingsLabel = S.pages.settings;
  protected readonly groupings: { key: Grouping; label: string }[] = [
    { key: 'drawer', label: S.freezer.byDrawer },
    { key: 'date', label: S.freezer.byDate },
  ];

  protected readonly themeIcon = computed(() => THEME_ICONS[this.theme.mode()]);
  protected readonly themeLabel = computed(() =>
    fill(S.freezer.theme, { mode: S.freezer.themeModes[this.theme.mode() as ThemeMode] }),
  );
  /** Every drawer shows (even at 0 items) until a search or category filter narrows the list. */
  protected readonly visibleGroups = computed(() => {
    const filtered = this.store.search().trim() !== '' || this.store.category() !== null;
    return this.store.groups().filter((g) => !filtered || g.items.length > 0);
  });
  protected readonly emptyMessage = computed(() => {
    const q = this.store.search().trim();
    return q === '' ? S.freezer.noCategory : fill(S.freezer.noMatches, { q });
  });

  constructor() {
    // The tab bar's + lands here as `/?add=1`: open the sheet once, then drop the param.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      if (!params.has('add')) return;
      this.itemSheet.open();
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    });
  }

  protected onSearch(event: Event): void {
    this.store.search.set((event.target as HTMLInputElement).value);
  }

  protected selectCategory(key: CategoryKey | null): void {
    this.store.category.set(key);
  }

  protected open(item: ItemView): void {
    this.itemSheet.open(item);
  }

  protected take(item: ItemView): void {
    if (isCountedUnit(item.unit)) {
      // The store has already toasted and rolled back on failure.
      this.store.takeOut(item.id).catch(() => undefined);
    } else {
      this.takeOutSheet.open(item);
    }
  }
}
