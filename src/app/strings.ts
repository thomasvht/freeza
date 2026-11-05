import type { ApiErrorCode } from '@shared/api-types';

/** Every UI string. Placeholders like `{q}` are filled with `fill()`. */
export const S = {
  appName: 'Freeza',

  tabs: {
    label: 'Main',
    freezer: 'Freezer',
    recipes: 'Recipes',
    add: 'Add item',
  },

  pages: {
    freezer: 'Freezer',
    recipes: 'Recipes',
    settings: 'Settings',
  },

  freezer: {
    empty: 'Your freezer is empty – tap + to add the first item.',
    noMatches: "Nothing matches '{q}'.",
    noCategory: 'Nothing in this category.',
    search: 'Search',
    searchPlaceholder: 'Search your freezer',
    categories: 'Categories',
    all: 'All',
    useFirst: 'Use first',
    grouping: 'Group items',
    byDrawer: 'By drawer',
    byDate: 'By date',
    takeOne: 'Take one {name} out',
    theme: 'Theme: {mode}. Tap to change.',
    themeModes: { system: 'System', light: 'Light', dark: 'Dark' },
  },

  recipes: {
    ask: 'What can I make?',
    limit: 'Recipe ideas are resting for today – try again tomorrow.',
    failed: "Couldn't think of anything – try again.",
  },

  status: {
    offline: 'Offline – changes are disabled',
    sessionExpired: 'Session expired – tap to sign in again',
  },

  days: {
    expired: 'Expired',
    today: 'Today',
    oneDay: '1 day',
    days: '{n} days',
    months: '{n} months',
  },

  toast: {
    dismiss: 'Dismiss',
  },

  undo: {
    deleted: 'Deleted {name}',
    undo: 'Undo',
    tookLast: 'Took the last {name} out',
  },

  sheet: {
    addTitle: 'Add item',
    editTitle: 'Edit item',
    name: 'Name',
    suggestions: 'Suggestions',
    category: 'Category',
    drawer: 'Drawer',
    quantity: 'Quantity',
    decrease: 'Decrease quantity',
    increase: 'Increase quantity',
    unit: 'Unit',
    packSize: 'Pack size (optional)',
    packUnit: 'Pack unit',
    frozenOn: 'Frozen on',
    bestBefore: 'Best before',
    suggested: 'suggested',
    notes: 'Notes (optional)',
    save: 'Save',
    delete: 'Delete',
  },

  takeOut: {
    title: 'Take out {name}',
    amount: 'Amount ({unit})',
    confirm: 'Take out',
    cancel: 'Cancel',
  },

  errors: {
    generic: 'Something went wrong – please try again.',
    network: "Can't reach the server – check your connection.",
    session_expired: 'Session expired – tap to sign in again',
    validation_failed: "That wasn't saved – check the values and try again.",
    not_found: 'That was changed or removed on another phone.',
    conflict: 'That changed on another phone – try again.',
    unauthorized: 'Session expired – tap to sign in again',
    forbidden: "You don't have access to this freezer.",
    drawer_limit: 'You can have at most 10 drawers.',
    last_drawer: "The last drawer can't be removed.",
    drawer_gone: 'That drawer was removed on another phone.',
    ai_limit: 'Recipe ideas are resting for today – try again tomorrow.',
    empty_freezer: 'Your freezer is empty – tap + to add the first item.',
    recipes_failed: "Couldn't think of anything – try again.",
    internal: 'Something went wrong – please try again.',
  } satisfies Record<ApiErrorCode | 'network' | 'session_expired' | 'generic', string>,
} as const;

/** Replaces `{key}` placeholders in a template. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
