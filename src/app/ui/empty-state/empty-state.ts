import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideSnowflake } from '@lucide/angular';

@Component({
  selector: 'app-empty-state',
  imports: [LucideSnowflake],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg lucideSnowflake [size]="56" [strokeWidth]="2" aria-hidden="true"></svg>
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

    svg {
      color: var(--accent-ink);
    }
  `,
})
export class EmptyState {
  readonly message = input.required<string>();
}
