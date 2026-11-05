import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideAngularModule, Snowflake } from 'lucide-angular';

@Component({
  selector: 'app-empty-state',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <lucide-icon [img]="snowflake" [size]="56" [strokeWidth]="2" aria-hidden="true" />
    <p>{{ message() }}</p>
  `,
  styles: `
    :host {
      display: grid;
      justify-items: center;
      gap: 12px;
      padding: 48px 24px;
      text-align: center;
      color: var(--muted);
    }

    lucide-icon,
    svg {
      color: var(--accent-ink);
    }
  `,
})
export class EmptyState {
  readonly message = input.required<string>();
  protected readonly snowflake = Snowflake;
}
