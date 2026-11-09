import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  viewChild,
} from '@angular/core';

const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])';

/**
 * Modal sheet (DESIGN.md §5.2): a bottom sheet on phones, a centred dialog on tablets. Moves focus in
 * on open (the `[data-autofocus]` element, else the first control), traps Tab, closes on Escape and
 * backdrop tap, and returns focus to the element that opened it.
 */
@Component({
  selector: 'app-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div #panel class="panel" role="dialog" aria-modal="true" [attr.aria-label]="label()">
      <div class="body"><ng-content /></div>
      <div class="footer"><ng-content select="[footer]" /></div>
    </div>
  `,
  styleUrl: './sheet.scss',
})
export class Sheet implements OnDestroy {
  readonly label = input.required<string>();
  readonly closed = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly document = inject(DOCUMENT);
  private readonly opener = this.document.activeElement as HTMLElement | null;

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closed.emit();
    } else if (event.key === 'Tab') {
      this.trapTab(event);
    }
  };

  constructor() {
    // At document level, so Escape and Tab still work when focus has landed outside the panel.
    this.document.addEventListener('keydown', this.onKeydown);
    afterNextRender(() => {
      const panel = this.panel().nativeElement;
      (
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.querySelector<HTMLElement>(FOCUSABLE)
      )?.focus();
    });
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('keydown', this.onKeydown);
    if (this.opener?.isConnected) this.opener.focus();
  }

  private trapTab(event: KeyboardEvent): void {
    const panel = this.panel().nativeElement;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = this.document.activeElement;
    if (!active || !panel.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
