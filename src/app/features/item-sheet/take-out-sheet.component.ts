import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { parseDecimal } from '@shared/decimal';
import { isPositiveNumber } from '@shared/item-rules';
import { UNIT_LABELS } from '@shared/units';
import { ConnectivityService } from '../../core/connectivity.service';
import { formatQuantity } from '../../core/format';
import { InventoryStore } from '../../core/inventory.store';
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
        @if (rest(); as hint) {
          <p class="hint" aria-live="polite">{{ hint }}</p>
        }
      </div>
      <ng-container footer>
        <button type="button" class="cancel" (click)="close()">{{ s.cancel }}</button>
        <button type="button" class="confirm" [disabled]="!online() || parsed() === null" (click)="submit()">
          {{ s.confirm }}
        </button>
      </ng-container>
    </app-sheet>
  `,
  styleUrl: './take-out-sheet.component.scss',
})
export class TakeOutSheetComponent {
  private readonly sheet = inject(TakeOutSheetService);
  private readonly store = inject(InventoryStore);
  protected readonly online = inject(ConnectivityService).online;
  private readonly undo = inject(TakeOutUndoService);
  private readonly item = this.sheet.item()!;

  protected readonly s = S.takeOut;
  protected readonly title = fill(S.takeOut.title, { name: this.item.name });
  protected readonly amountLabel = fill(S.takeOut.amount, { unit: UNIT_LABELS[this.item.unit] });
  protected readonly amount = inject(NonNullableFormBuilder).control('');

  private readonly text = toSignal(this.amount.valueChanges, { initialValue: '' });
  /** What is in the freezer now: the store's quantity, which a refresh can change while the sheet is open. */
  private readonly available = computed(
    () => this.store.items().find((i) => i.id === this.item.id)?.quantity ?? this.item.quantity,
  );
  /** The amount when it is above 0; null otherwise. More than is left is fine: the server clamps it to 0. */
  protected readonly parsed = computed(() => {
    const n = parseDecimal(this.text());
    return n !== null && isPositiveNumber(n) ? n : null;
  });
  /** "Only 0,8 kg left – takes the rest" when the amount is more than what is left. */
  protected readonly rest = computed(() => {
    const n = this.parsed();
    if (n === null || n <= this.available()) return null;
    return fill(S.takeOut.takesRest, { qty: formatQuantity({ ...this.item, quantity: this.available() }) });
  });

  protected submit(): void {
    const amount = this.parsed();
    if (amount === null || !this.online()) return;
    this.sheet.close();
    void this.undo.takeOut(this.item, amount);
  }

  protected close(): void {
    this.sheet.close();
  }
}
