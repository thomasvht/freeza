import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Recipe, RecipesBody, RecipesResponse } from '@shared/api-types';
import { PREFERENCE_MAX } from '@shared/item-rules';
import { ApiClient, ApiError } from '../../core/api.client';
import { InventoryStore } from '../../core/inventory.store';
import { fill, S } from '../../strings';

/** Also the last result's place on the device (DESIGN.md §4.6). */
const STORAGE_KEY = 'freeza-recipes';
const SKELETONS = [0, 1, 2];

@Component({
  selector: 'app-recipes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recipes.page.html',
  styleUrl: './recipes.page.scss',
})
export class RecipesPage {
  private readonly api = inject(ApiClient);
  private readonly store = inject(InventoryStore);

  protected readonly s = S.recipes;
  protected readonly title = S.pages.recipes;
  protected readonly preferenceMax = PREFERENCE_MAX;
  protected readonly skeletons = SKELETONS;

  protected readonly preference = signal('');
  protected readonly loading = signal(false);
  protected readonly recipes = signal<Recipe[]>(readStored());
  private readonly error = signal<string | null>(null);
  private readonly serverSaysEmpty = signal(false);

  private readonly freezerEmpty = computed(
    () => this.serverSaysEmpty() || (this.store.loaded() && this.store.items().length === 0),
  );
  protected readonly canAsk = computed(() => !this.loading() && !this.freezerEmpty());
  /** The one status line under the button, if any. */
  protected readonly message = computed(() =>
    this.freezerEmpty() ? S.errors.empty_freezer : this.error(),
  );

  protected minutes(recipe: Recipe): string {
    return fill(S.recipes.minutes, { n: recipe.minutes });
  }

  protected async ask(): Promise<void> {
    if (!this.canAsk()) return;
    const body: RecipesBody = { today: this.store.today() };
    const preference = this.preference().trim();
    if (preference !== '') body.preference = preference;

    this.error.set(null);
    this.loading.set(true);
    try {
      const res = await this.api.post<RecipesResponse>('/recipes', body);
      this.recipes.set(res.recipes);
      persist(res);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'empty_freezer') this.serverSaysEmpty.set(true);
      else this.error.set(e instanceof ApiError && e.code === 'ai_limit' ? S.recipes.limit : S.recipes.failed);
    } finally {
      this.loading.set(false);
    }
  }
}

function persist(res: RecipesResponse): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
  } catch {
    // Storage blocked or full: the result just isn't kept across reloads.
  }
}

function readStored(): Recipe[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    const list = (parsed as { recipes?: unknown } | null)?.recipes;
    return Array.isArray(list) && list.every(isRecipe) ? list : [];
  } catch {
    return [];
  }
}

function isRecipe(r: unknown): r is Recipe {
  const x = r as Partial<Recipe> | null;
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof x.name === 'string' &&
    typeof x.minutes === 'number' &&
    typeof x.method === 'string' &&
    Array.isArray(x.alsoNeed) &&
    x.alsoNeed.every((a) => typeof a === 'string') &&
    Array.isArray(x.uses) &&
    x.uses.every((u) => typeof u === 'object' && u !== null && typeof u.name === 'string')
  );
}
