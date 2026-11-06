import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import type { CreateItemBody, PatchItemBody, SuggestionDto } from '@shared/api-types';
import { CATEGORIES, type CategoryKey } from '@shared/categories';
import { parseDecimal } from '@shared/decimal';
import { suggestBestBefore } from '@shared/expiry';
import {
  checkItemRules,
  isIsoDate,
  isPositiveNumber,
  ITEM_NAME_MAX,
  ITEM_NOTES_MAX,
} from '@shared/item-rules';
import {
  isCountedUnit,
  PACK_UNITS,
  UNIT_LABELS,
  UNITS,
  type PackUnit,
  type Unit,
} from '@shared/units';
import { ConnectivityService } from '../../core/connectivity.service';
import { formatTimestampDate } from '../../core/format';
import { InventoryStore, type ItemView } from '../../core/inventory.store';
import { ToastService } from '../../core/toast.service';
import { fill, S } from '../../strings';
import { Sheet } from '../../ui/sheet/sheet';
import { Stepper } from '../../ui/stepper/stepper';
import { ItemSheetService } from './item-sheet.service';

const MAX_SUGGESTIONS = 5;

/** Number to the text shown in a decimal field: decimal comma. */
function toText(n: number): string {
  return String(n).replace('.', ',');
}

/** Add/edit sheet (DESIGN.md §5.2). Created per open, so the form starts fresh every time. */
@Component({
  selector: 'app-item-sheet',
  imports: [ReactiveFormsModule, Sheet, Stepper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './item-sheet.component.html',
  styleUrl: './item-sheet.component.scss',
})
export class ItemSheetComponent {
  private readonly store = inject(InventoryStore);
  protected readonly online = inject(ConnectivityService).online;
  private readonly sheet = inject(ItemSheetService);
  private readonly toast = inject(ToastService);

  private readonly item = this.sheet.item();
  private readonly id = this.item?.id ?? crypto.randomUUID();

  protected readonly s = S.sheet;
  protected readonly editing = this.item !== undefined;
  protected readonly title = this.editing ? S.sheet.editTitle : S.sheet.addTitle;
  protected readonly categories = CATEGORIES;
  protected readonly units = UNITS.map((value) => ({ value, label: UNIT_LABELS[value] }));
  protected readonly packUnits = PACK_UNITS;
  protected readonly drawers = computed(() =>
    [...this.store.drawers()].sort((a, b) => a.position - b.position),
  );

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: this.item?.name ?? '',
    category: (this.item?.category ?? 'meat') as CategoryKey,
    drawerId: this.item?.drawerId ?? this.drawers()[0]?.id ?? '',
    quantity: this.item ? toText(this.item.quantity) : '1',
    unit: (this.item?.unit ?? 'piece') as Unit,
    packSize: this.item?.packSize != null ? toText(this.item.packSize) : '',
    packUnit: (this.item?.packUnit ?? 'g') as PackUnit,
    frozenOn: this.item?.frozenOn ?? this.store.today(),
    bestBefore: this.item?.bestBefore ?? '',
    notes: this.item?.notes ?? '',
  });

  /** "Added by Thomas · 03/11/2026" in edit mode (DESIGN.md §4.7); null when adding. */
  protected readonly addedBy = computed(() => {
    const item = this.item;
    if (!item) return null;
    const name =
      this.store.members().find((m) => m.email === item.createdBy)?.displayName ??
      (item as Partial<ItemView>).addedByName ??
      item.createdBy.split('@')[0];
    return fill(S.sheet.addedBy, { name, date: formatTimestampDate(item.createdAt) });
  });

  /** True once the user typed a best-before date; the category then stops overwriting it. */
  protected readonly manual = signal(this.item?.bestBeforeManual ?? false);

  private readonly changes = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  protected readonly raw = computed(() => {
    this.changes();
    return this.form.getRawValue();
  });
  protected readonly counted = computed(() => isCountedUnit(this.raw().unit));
  protected readonly step = computed(() => (this.counted() ? 1 : 0.1));

  /**
   * The body the API would accept, or null. Mirrors CreateItemBodySchema: the cross-field rules come from
   * `checkItemRules`; name, notes, number and date checks are the schema's. (The app can't import the
   * schema itself: zod would add about 500 kB to the bundle.)
   */
  private readonly parsed = computed<CreateItemBody | null>(() => {
    const f = this.raw();
    const name = f.name.trim();
    const notes = f.notes.trim();
    const quantity = parseDecimal(f.quantity);
    const packBlank = f.packSize.trim() === '';
    const packSize = packBlank ? null : parseDecimal(f.packSize);
    const body = {
      id: this.id,
      name,
      category: f.category,
      drawerId: f.drawerId,
      quantity: quantity ?? 0,
      unit: f.unit,
      packSize: packSize ?? null,
      packUnit: packBlank ? null : f.packUnit,
      frozenOn: f.frozenOn,
      bestBefore: f.bestBefore,
      bestBeforeManual: this.manual(),
      notes: notes === '' ? null : notes,
    };
    const valid =
      name.length >= 1 &&
      name.length <= ITEM_NAME_MAX &&
      notes.length <= ITEM_NOTES_MAX &&
      f.drawerId !== '' &&
      quantity !== null &&
      isPositiveNumber(quantity) &&
      (packBlank || (packSize !== null && isPositiveNumber(packSize))) &&
      isIsoDate(f.frozenOn) &&
      isIsoDate(f.bestBefore) &&
      checkItemRules(body).length === 0;
    return valid ? body : null;
  });
  protected readonly canSave = computed(() => this.online() && this.parsed() !== null);

  private readonly suggestOpen = signal(false);
  protected readonly activeIndex = signal(-1);
  protected readonly matches = computed<SuggestionDto[]>(() => {
    const q = this.raw().name.trim().toLowerCase();
    if (!this.suggestOpen() || q === '') return [];
    return this.store
      .suggestions()
      .filter((x) => x.name.toLowerCase().includes(q) && x.name.toLowerCase() !== q)
      .slice(0, MAX_SUGGESTIONS);
  });

  constructor() {
    const { category, frozenOn, unit, packSize } = this.form.controls;
    if (!this.item) this.suggestBestBefore();
    // Opened before the drawers loaded: default to the first drawer once they arrive.
    effect(() => {
      const first = this.drawers()[0];
      if (first && this.form.controls.drawerId.value === '') this.form.controls.drawerId.setValue(first.id);
    });
    category.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.suggestBestBefore());
    frozenOn.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.suggestBestBefore());
    unit.valueChanges.pipe(takeUntilDestroyed()).subscribe((u) => {
      if (!isCountedUnit(u)) packSize.setValue('');
    });
  }

  protected pickCategory(key: CategoryKey): void {
    this.form.controls.category.setValue(key);
  }

  protected pickDrawer(id: string): void {
    this.form.controls.drawerId.setValue(id);
  }

  protected onNameInput(): void {
    this.suggestOpen.set(true);
    this.activeIndex.set(-1);
  }

  protected onNameKeydown(event: KeyboardEvent): void {
    const count = this.matches().length;
    if (count === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex.update((i) => (i + delta + count + (i < 0 && delta < 0 ? 1 : 0)) % count);
      event.preventDefault();
    } else if (event.key === 'Enter' && this.activeIndex() >= 0) {
      event.preventDefault();
      this.pickSuggestion(this.matches()[this.activeIndex()]);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      this.suggestOpen.set(false);
    }
  }

  protected pickSuggestion(s: SuggestionDto): void {
    const c = this.form.controls;
    c.name.setValue(s.name);
    c.category.setValue(s.category);
    c.drawerId.setValue(
      this.drawers().some((d) => d.id === s.drawerId) ? s.drawerId : (this.drawers()[0]?.id ?? ''),
    );
    c.unit.setValue(s.unit);
    c.packSize.setValue(s.packSize === null ? '' : toText(s.packSize));
    c.packUnit.setValue(s.packUnit ?? 'g');
    this.suggestOpen.set(false);
  }

  protected save(): void {
    const body = this.parsed();
    if (body === null || !this.online()) return;
    this.sheet.close();
    let done: Promise<void>;
    if (this.item) {
      // Only the fields the user changed: resending the rest would undo the other phone's edits and take-outs.
      const patch = changedFields(this.item, body);
      if (Object.keys(patch).length === 0) return;
      done = this.store.updateItem(this.item.id, patch);
    } else {
      done = this.store.createItem(body);
    }
    // The store has already toasted and rolled back on failure.
    done.catch(() => undefined);
  }

  protected delete(): void {
    if (!this.item || !this.online()) return;
    this.sheet.close();
    this.store
      .deleteItem(this.item.id)
      .then((item) =>
        this.toast.show({
          message: fill(S.undo.deleted, { name: item.name }),
          actionLabel: S.undo.undo,
          action: () => void this.store.restoreItem(item).catch(() => undefined),
        }),
      )
      .catch(() => undefined);
  }

  protected close(): void {
    this.sheet.close();
  }

  /** Best before follows frozen on + the category's shelf life until the user sets it by hand. */
  private suggestBestBefore(): void {
    const { frozenOn, category, bestBefore } = this.form.controls;
    if (this.manual() || !isIsoDate(frozenOn.value)) return;
    bestBefore.setValue(suggestBestBefore(frozenOn.value, category.value));
  }
}

/** The fields of `body` whose value differs from the item as it was opened. */
function changedFields(item: CreateItemBody, body: CreateItemBody): PatchItemBody {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(body) as (keyof CreateItemBody)[]) {
    if (key !== 'id' && body[key] !== item[key]) patch[key] = body[key];
  }
  return patch as PatchItemBody;
}
