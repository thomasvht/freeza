import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { parseDecimal } from '@shared/decimal';
import { UNIT_LABELS } from '@shared/units';
import { fill, S } from '../../strings';
import { Sheet } from '../../ui/sheet/sheet';
import { TakeOutSheetService } from './take-out-sheet.service';
import { TakeOutUndoService } from './take-out-undo.service';

/** Amount to take out of a measured item (g, kg, ml, l). Created per open. */
@Component({
  selector: 'app-take-out-sheet',
  imports: [ReactiveFormsModule, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet [label]="title" (closed)="close()">
      <h2 class="t-title">{{ title }}</h2>
      <div class="field">
        <label for="f-amount" class="t-label">{{ amountLabel }}</label>
        <input
          id="f-amount"
          name="amount"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          data-autofocus
          [formControl]="amount"
          (keydown.enter)="submit()"
        />
      </div>
      <ng-container footer>
        <button type="button" class="cancel" (click)="close()">{{ s.cancel }}</button>
        <button type="button" class="confirm" [disabled]="parsed() === null" (click)="submit()">
          {{ s.confirm }}
        </button>
      </ng-container>
    </app-sheet>
  `,
  styleUrl: './take-out-sheet.component.scss',
})
export class TakeOutSheetComponent {
  private readonly sheet = inject(TakeOutSheetService);
  private readonly undo = inject(TakeOutUndoService);
  private readonly item = this.sheet.item()!;

  protected readonly s = S.takeOut;
  protected readonly title = fill(S.takeOut.title, { name: this.item.name });
  protected readonly amountLabel = fill(S.takeOut.amount, { unit: UNIT_LABELS[this.item.unit] });
  protected readonly amount = inject(NonNullableFormBuilder).control('');

  private readonly text = toSignal(this.amount.valueChanges, { initialValue: '' });
  /** The amount when it is above 0 and at most what is in the freezer; null otherwise. */
  protected readonly parsed = computed(() => {
    const n = parseDecimal(this.text());
    return n !== null && n > 0 && n <= this.item.quantity ? n : null;
  });

  protected submit(): void {
    const amount = this.parsed();
    if (amount === null) return;
    this.sheet.close();
    void this.undo.takeOut(this.item, amount);
  }

  protected close(): void {
    this.sheet.close();
  }
}
