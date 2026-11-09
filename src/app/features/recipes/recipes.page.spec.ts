import { TestBed } from '@angular/core/testing';
import type { InventoryResponse, RecipesResponse } from '@shared/api-types';
import { ApiClient, ApiError } from '../../core/api.client';
import { InventoryStore } from '../../core/inventory.store';
import { RecipesPage } from './recipes.page';

const KEY = 'freeza-recipes';

const RESPONSE: RecipesResponse = {
  recipes: [
    {
      name: 'Beef chili',
      minutes: 25,
      uses: [
        { name: 'Minced beef', itemId: 'beef', status: 'use-soon' },
        { name: 'Peas', itemId: 'peas', status: 'fresh' },
      ],
      alsoNeed: ['onion', 'tomatoes'],
      method: 'Brown the beef. Simmer with tomatoes.',
    },
    { name: 'Fish pie', minutes: 40, uses: [], alsoNeed: ['potatoes'], method: 'Bake.' },
    { name: 'Soup', minutes: 15, uses: [], alsoNeed: [], method: 'Boil.' },
  ],
};

function inventory(withItem: boolean): InventoryResponse {
  return {
    drawers: [{ id: 'drawer-1', name: 'Top', position: 1 }],
    items: withItem
      ? [
          {
            id: 'beef',
            name: 'Minced beef',
            category: 'meat',
            drawerId: 'drawer-1',
            quantity: 1,
            unit: 'piece',
            packSize: null,
            packUnit: null,
            frozenOn: '2026-10-01',
            bestBefore: '2026-11-10',
            bestBeforeManual: false,
            notes: null,
            createdBy: 'a@b.c',
            updatedBy: 'a@b.c',
            createdAt: '2026-11-01T10:00:00.000Z',
            updatedAt: '2026-11-01T10:00:00.000Z',
          },
        ]
      : [],
    members: [],
    me: { email: 'a@b.c', displayName: 'A' },
    suggestions: [],
    // Each response is newer than the last, like a live server (the store drops older ones).
    serverTime: new Date(Date.UTC(2026, 10, 5, 10) + ++serverClock * 1000).toISOString(),
  };
}

let serverClock = 0;

describe('RecipesPage', () => {
  const post = vi.fn();
  let el: HTMLElement;
  let fixture: ReturnType<typeof TestBed.createComponent<RecipesPage>>;

  async function setup(withItem = true) {
    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: { get: async () => inventory(withItem), post } }],
    });
    await TestBed.inject(InventoryStore).refresh();
    fixture = TestBed.createComponent(RecipesPage);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  const ask = () => el.querySelector<HTMLButtonElement>('button.ask')!;
  const press = async () => {
    ask().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('posts the trimmed preference and today, shows 3 skeletons while pending, then 3 cards', async () => {
    let resolve!: (r: RecipesResponse) => void;
    post.mockReturnValue(new Promise((r) => (resolve = r)));
    await setup();
    const input = el.querySelector<HTMLInputElement>('input.preference')!;
    input.value = '  vegetarian ';
    input.dispatchEvent(new Event('input'));
    ask().click();
    fixture.detectChanges();

    expect(post).toHaveBeenCalledWith('/recipes', {
      preference: 'vegetarian',
      today: TestBed.inject(InventoryStore).today(),
    });
    expect(el.querySelectorAll('.skeleton')).toHaveLength(3);
    expect(el.querySelectorAll('.recipe')).toHaveLength(0);

    resolve(RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelectorAll('.skeleton')).toHaveLength(0);
    const cards = el.querySelectorAll('.recipe');
    expect(cards).toHaveLength(3);
    const first = cards[0];
    expect(first.textContent).toContain('Beef chili');
    expect(first.textContent).toContain('25 min');
    expect(first.textContent).toContain("You'll also need");
    expect(first.textContent).toContain('onion');
    expect(first.textContent).toContain('Brown the beef. Simmer with tomatoes.');
    const uses = [...first.querySelectorAll('.use')];
    expect(uses.map((u) => u.classList.contains('soon'))).toEqual([true, false]);
  });

  it('omits an empty preference from the request', async () => {
    post.mockResolvedValue(RESPONSE);
    await setup();
    await press();
    expect(post.mock.calls[0][1]).not.toHaveProperty('preference');
  });

  it('limits the preference to 100 characters', async () => {
    await setup();
    expect(el.querySelector('input.preference')!.getAttribute('maxlength')).toBe('100');
  });

  it('renders model text as plain text, never markup', async () => {
    post.mockResolvedValue({
      recipes: RESPONSE.recipes.map((r) => ({ ...r, method: '<img src=x onerror=alert(1)>' })),
    });
    await setup();
    await press();
    expect(el.querySelector('.recipe img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('shows the resting message on 429 ai_limit', async () => {
    post.mockRejectedValue(new ApiError(429, 'ai_limit', 'x'));
    await setup();
    await press();
    expect(el.textContent).toContain('Recipe ideas are resting for today – try again tomorrow.');
    expect(el.querySelectorAll('.skeleton')).toHaveLength(0);
  });

  it.each([
    ['502', new ApiError(502, 'recipes_failed', 'x')],
    ['network', new ApiError(0, 'network', 'x')],
  ])('shows the failure message on %s', async (_name, error) => {
    post.mockRejectedValue(error);
    await setup();
    await press();
    expect(el.textContent).toContain("Couldn't think of anything – try again.");
  });

  it('shows the empty-freezer message and disables the button on 400 empty_freezer', async () => {
    post.mockRejectedValue(new ApiError(400, 'empty_freezer', 'x'));
    await setup();
    await press();
    expect(el.textContent).toContain('Your freezer is empty – tap + to add the first item.');
    expect(ask().disabled).toBe(true);
  });

  it('announces loading in the status line', async () => {
    post.mockReturnValue(new Promise(() => undefined));
    await setup();
    ask().click();
    fixture.detectChanges();
    expect(el.querySelector('[role="status"]')!.textContent).toContain('Thinking of recipes');
  });

  it('re-enables the button once items appear after an empty_freezer error', async () => {
    post.mockRejectedValue(new ApiError(400, 'empty_freezer', 'x'));
    await setup();
    await press();
    expect(ask().disabled).toBe(true);
    const store = TestBed.inject(InventoryStore);
    const [first] = store.items();
    (TestBed.inject(ApiClient) as unknown as { get: () => Promise<InventoryResponse> }).get = async () => ({
      ...inventory(true),
      items: [first, { ...first, id: 'two' }],
    });
    await store.refresh();
    fixture.detectChanges();
    expect(ask().disabled).toBe(false);
  });

  it('disables the button up front when the freezer is empty', async () => {
    await setup(false);
    expect(el.textContent).toContain('Your freezer is empty – tap + to add the first item.');
    expect(ask().disabled).toBe(true);
    ask().click();
    expect(post).not.toHaveBeenCalled();
  });

  it('stores the last result and restores it on reload', async () => {
    post.mockResolvedValue(RESPONSE);
    await setup();
    await press();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(RESPONSE);

    TestBed.resetTestingModule();
    await setup();
    expect(el.querySelectorAll('.recipe')).toHaveLength(3);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('ignores a corrupt stored value', async () => {
    localStorage.setItem(KEY, '{"recipes":"nope"');
    await setup();
    expect(el.querySelectorAll('.recipe')).toHaveLength(0);
    localStorage.setItem(KEY, JSON.stringify({ recipes: [{ name: 1 }] }));
    TestBed.resetTestingModule();
    await setup();
    expect(el.querySelectorAll('.recipe')).toHaveLength(0);
  });

  it('disables the ask button while offline', async () => {
    const spy = vi.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
    try {
      await setup();
      expect(ask().disabled).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
