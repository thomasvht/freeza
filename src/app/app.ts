import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { InventoryStore } from './core/inventory.store';
import { ItemSheetComponent } from './features/item-sheet/item-sheet.component';
import { ItemSheetService } from './features/item-sheet/item-sheet.service';
import { TakeOutSheetComponent } from './features/item-sheet/take-out-sheet.component';
import { TakeOutSheetService } from './features/item-sheet/take-out-sheet.service';
import { ThemeService } from './core/theme.service';
import { OfflineBanner } from './ui/offline-banner/offline-banner';
import { TabBar } from './ui/tab-bar/tab-bar';
import { ToastHost } from './ui/toast-host/toast-host';

/** Static snow specks (DESIGN.md §6.5): 8 dots, no animation. */
const SNOW = [1, 2, 3, 4, 5, 6, 7, 8];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, OfflineBanner, TabBar, ToastHost, ItemSheetComponent, TakeOutSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="snow" aria-hidden="true">
      @for (n of snow; track n) {
        <span></span>
      }
    </div>
    <app-offline-banner />
    <main>
      <router-outlet />
    </main>
    <app-tab-bar />
    @if (itemSheet.isOpen()) {
      <app-item-sheet />
    }
    @if (takeOutSheet.isOpen()) {
      <app-take-out-sheet />
    }
    <app-toast-host />
  `,
  styles: `
    main {
      max-width: 560px;
      margin: 0 auto;
      padding: calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right))
        calc(120px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));
    }

    .snow {
      position: fixed;
      inset: 0;
      z-index: -1;
      pointer-events: none;
      opacity: var(--snow-opacity);

      span {
        position: absolute;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--snow);

        &:nth-child(1) {
          top: 8%;
          left: 14%;
        }
        &:nth-child(2) {
          top: 15%;
          left: 78%;
          width: 3px;
          height: 3px;
        }
        &:nth-child(3) {
          top: 29%;
          left: 42%;
          width: 5px;
          height: 5px;
        }
        &:nth-child(4) {
          top: 41%;
          left: 88%;
        }
        &:nth-child(5) {
          top: 56%;
          left: 9%;
          width: 3px;
          height: 3px;
        }
        &:nth-child(6) {
          top: 67%;
          left: 63%;
        }
        &:nth-child(7) {
          top: 79%;
          left: 27%;
          width: 5px;
          height: 5px;
        }
        &:nth-child(8) {
          top: 90%;
          left: 83%;
          width: 3px;
          height: 3px;
        }
      }
    }
  `,
})
export class App {
  protected readonly snow = SNOW;
  protected readonly itemSheet = inject(ItemSheetService);
  protected readonly takeOutSheet = inject(TakeOutSheetService);

  constructor() {
    // Applies the stored theme and keeps theme-color in sync.
    inject(ThemeService);
    const store = inject(InventoryStore);
    store.startPolling();
    inject(DestroyRef).onDestroy(() => store.stopPolling());
  }
}
