import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { LucideMinus, LucidePlus } from '@lucide/angular';
import { parseDecimal } from '@shared/decimal';
import { S } from '../../strings';

/** Quantity field with − / + buttons. The control holds the typed text; a comma or dot both parse. */
@Component({
  selector: 'app-stepper',
  imports: [ReactiveFormsModule, LucideMinus, LucidePlus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="step dec" [attr.aria-label]="s.decrease" (click)="bump(-1)">
      <svg lucideMinus [size]="20" [strokeWidth]="2" aria-hidden="true"></svg>
    </button>
    <input
      type="text"
      inputmode="decimal"
      autocomplete="off"
      name="quantity"
      [attr.aria-label]="s.quantity"
      [formControl]="control()"
    />
    <button type="button" class="step inc" [attr.aria-label]="s.increase" (click)="bump(1)">
      <svg lucidePlus [size]="20" [strokeWidth]="2" aria-hidden="true"></svg>
    </button>
  `,
  styleUrl: './stepper.scss',
})
export class Stepper {
  readonly control = input.required<FormControl<string>>();
  /** 1 for counted units, 0.1 for weights and volumes. */
  readonly step = input(1);

  protected readonly s = S.sheet;

  protected bump(direction: 1 | -1): void {
    const control = this.control();
    const next =
      Math.round(((parseDecimal(control.value) ?? 0) + direction * this.step()) * 1e6) / 1e6;
    control.setValue(String(Math.max(next, this.step())).replace('.', ','));
    control.markAsDirty();
  }
}
