import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CATEGORIES, type CategoryKey } from '@shared/categories';
import { S } from '../../../strings';

@Component({
  selector: 'app-category-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row" role="group" [attr.aria-label]="s.categories">
      <button type="button" [attr.aria-pressed]="selected() === null" (click)="select.emit(null)">
        {{ s.all }}
      </button>
      @for (c of categories; track c.key) {
        <button type="button" [attr.aria-pressed]="selected() === c.key" (click)="select.emit(c.key)">
          {{ c.label }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      // Without this, the scrolling row widens the layout viewport on mobile Chromium (found by e2e).
      contain: inline-size;
    }

    .row {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      // Room for the 2 px focus ring + 2 px offset, which overflow-x would clip.
      padding: 4px;
      margin: -4px;
      scrollbar-width: none;
    }

    button {
      flex: none;
      min-height: 44px;
      padding: 0 16px;
      border-radius: 999px;
      border: 1px solid var(--glass-border);
      background: var(--glass);
      color: var(--ink);
      font-weight: 600;
      white-space: nowrap;

      &[aria-pressed='true'] {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--on-accent);
      }
    }
  `,
})
export class CategoryChips {
  readonly selected = input.required<CategoryKey | null>();
  readonly select = output<CategoryKey | null>();

  protected readonly s = S.freezer;
  protected readonly categories = CATEGORIES;
}
