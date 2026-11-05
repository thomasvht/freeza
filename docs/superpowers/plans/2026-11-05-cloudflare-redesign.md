# Freeza Cloudflare Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Firebase app with a Cloudflare-hosted PWA: a Worker API
on D1 behind Cloudflare Access, Workers AI recipes, and a Glacier-themed
Angular 21 frontend.

**Architecture:** One Worker serves the Angular build (Static Assets with SPA
fallback) and a Hono JSON API under `/api` (run first). D1 holds drawers,
items, members and AI usage. Identity comes from the verified Access JWT.
Business rules (categories, units, dates, expiry) live in `shared/`, which the
client and the Worker both import.

**Tech Stack:**
- Frontend: Angular 21 (zoneless, signals), SCSS, `@angular/service-worker`,
  `@fontsource/manrope`, `lucide-angular`
- Worker: Wrangler ^4.158, Hono ^4.13, zod ^4.6, jose ^6.2, D1, Workers AI
- Tests: Vitest 4 (Angular unit-test builder), `@cloudflare/vitest-pool-workers`
  ^0.23, Playwright

**Spec:** `DESIGN.md` (product and visual), `ARCHITECTURE.md` (technical),
`CLAUDE.md` (working rules). Executors read all three. Section references
below, such as "A§4" or "D§6.2", point into ARCHITECTURE.md and DESIGN.md.

## Global Constraints

- Calendar dates are `YYYY-MM-DD` strings in DB, API and store. Timestamps are
  ISO-8601 UTC strings. No `Date` crosses the API.
- Display dates as `dd/MM/yyyy` (`dd/MM` when compact) and numbers with a
  decimal comma, via `Intl` `nl-BE`.
- Units: `piece`, `portion`, `bag`, `box`, `g`, `kg`, `ml`, `l`. Pack units:
  `g`, `kg`, `ml`, `l`. Pack size only with counted units.
- Use-soon threshold is exactly **14 days**, defined once in `shared/expiry.ts`.
- Recipe cap is **20 requests/day (UTC)**. Exactly **3** recipes.
- Drawers: 3 seeded (`drawer-1..3`, "Drawer 1..3"), max **10** active, names
  1–30 characters.
- Item name 1–60 characters (trimmed), notes ≤ 200, display name 1–30,
  preference ≤ 100.
- The local auth bypass applies only when `ENVIRONMENT === "local"`.
- Colours come only from tokens (D§6.2). WCAG AA in both themes. Touch
  targets ≥ 44 × 44 px. Inputs ≥ 16 px font size.
- UI copy is English, in `src/app/strings.ts`.
- Conventional Commits. Never commit `.dev.vars` or email addresses.
- Every new dependency: check its peer ranges against Angular 21 and Vitest 4
  before installing. If one doesn't fit, report it rather than using
  `--legacy-peer-deps`.

## Review Focus

1. **Local "today" near midnight.** At 23:30 on 05/11 in Brussels, today is
   `2026-11-05`, not the UTC date. Test in Task 1.
2. **Decimal comma typed on a Belgian phone.** "0,5" in quantity or take-out
   amount means 0.5, not invalid. Test in Task 2 (`parseDecimal`) and Task 9.
3. **Taking out more than is left.** For example 0.8 kg left, take 1 kg. The
   result clamps to 0, the item is removed and undo is offered. Test in
   Task 4.
4. **Editing an item the other phone just deleted.** `PATCH` returns `404`.
   The client rolls back, refreshes and shows a toast, and doesn't crash.
   Test in Task 4 (API) and Task 7 (store).
5. **Name suggestion pointing at a deleted drawer.** Picking the suggestion
   fills everything except the drawer, which falls back to the first active
   drawer. Test in Task 9.

---

### Task 1: Tooling and `shared/` business rules

**Files:**
- Modify: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `vitest.worker.config.mts`, `shared/categories.ts`, `shared/units.ts`,
  `shared/dates.ts`, `shared/expiry.ts`
- Test: `shared/dates.test.ts`, `shared/expiry.test.ts`, `shared/units.test.ts`

**Interfaces:**
- Produces:
  - `type CategoryKey = 'meat'|'poultry'|'fish'|'veg'|'bread'|'dairy'|'prepared'|'other'`
  - `CATEGORIES: readonly { key: CategoryKey; label: string; colorToken: string; shelfLifeMonths: number }[]`,
    in the order of D§4.2: labels "Meat", "Poultry", "Fish",
    "Vegetables & fruit", "Bread & baked", "Dairy", "Prepared meals",
    "Other"; months 6/9/4/10/3/4/3/6; tokens `--cat-<key>`
  - `CATEGORY_KEYS: readonly CategoryKey[]`
  - `type Unit`, `type PackUnit`, `UNITS: readonly Unit[]`,
    `PACK_UNITS: readonly PackUnit[]`, `UNIT_LABELS: Record<Unit, string>`
    (pieces, portions, bags, boxes, g, kg, ml, l)
  - `isCountedUnit(u: Unit): boolean`, true for piece/portion/bag/box
  - `type IsoDate = string`, `todayLocal(now?: Date): IsoDate`,
    `addMonths(d: IsoDate, months: number): IsoDate`,
    `daysBetween(from: IsoDate, to: IsoDate): number`
  - `USE_SOON_DAYS = 14`, `type ExpiryStatus = 'expired'|'use-soon'|'fresh'`,
    `expiryStatus(bestBefore: IsoDate, today: IsoDate): ExpiryStatus`,
    `suggestBestBefore(frozenOn: IsoDate, category: CategoryKey): IsoDate`

- [ ] **Step 1: Set up tooling.**
  - Add the tsconfig path `@shared/*` → `shared/*`.
  - Add devDependencies `wrangler`, `@cloudflare/vitest-pool-workers`.
  - Create `vitest.worker.config.mts` with
    `include: ['shared/**/*.test.ts', 'worker-test/**/*.test.ts']`. Task 3
    adds the workers pool.
  - Scripts:
    - `"test": "ng test --watch=false && vitest run -c vitest.worker.config.mts"`
    - `"test:worker": "vitest run -c vitest.worker.config.mts"`
  - Add to `.gitignore`: `.DS_Store`, `.dev.vars`, `.wrangler/`,
    `.superpowers/`. Keep `worker-configuration.d.ts` committed.
  - Run `git rm --cached .DS_Store`.
- [ ] **Step 2: Write failing tests.**
  - `todayLocal(new Date(2026, 10, 5, 23, 30))` → `'2026-11-05'`. Review
    Focus 1: build the date from local components, never `toISOString()`.
  - `addMonths('2026-08-31', 6)` → `'2027-02-28'` (clamps to the end of the
    month). `addMonths('2026-11-05', 3)` → `'2027-02-05'`.
  - `daysBetween('2026-11-05','2026-11-19')` → `14`. Across DST:
    `daysBetween('2026-03-28','2026-03-30')` → `2`.
  - With today `2026-11-05`, `expiryStatus`:
    - `'2026-11-04'` → `expired`
    - `'2026-11-05'` → `use-soon`
    - `'2026-11-19'` → `use-soon`
    - `'2026-11-20'` → `fresh`
  - `suggestBestBefore('2026-11-05','meat')` → `'2027-05-05'`.
    `suggestBestBefore('2026-11-05','bread')` → `'2027-02-05'`.
  - `isCountedUnit('bag')` → true. `isCountedUnit('kg')` → false.
- [ ] **Step 3: Run `npm run test:worker`.** Expected: FAIL (modules missing).
- [ ] **Step 4: Implement the four modules.** Do the date arithmetic on
  `YYYY-MM-DD` parts with `Date.UTC`, so DST can't shift days.
- [ ] **Step 5: Run `npm run test:worker`.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(shared): add categories, units, dates and expiry rules`.

### Task 2: API contract (`shared/api-types.ts`)

**Files:**
- Create: `shared/api-types.ts`, `shared/decimal.ts`
- Test: `shared/api-types.test.ts`, `shared/decimal.test.ts`

**Interfaces:**
- Consumes: Task 1 types and constants.
- Produces zod schemas with inferred types of the same name without `Schema`:
  - `ItemDtoSchema`: `{ id, name, category, drawerId, quantity, unit,
    packSize: number|null, packUnit: PackUnit|null, frozenOn, bestBefore,
    bestBeforeManual: boolean, notes: string|null, createdBy, updatedBy,
    createdAt, updatedAt }`
  - `DrawerDtoSchema`: `{ id, name, position }`
  - `MemberDtoSchema`: `{ email, displayName }`
  - `SuggestionDtoSchema`: `{ name, category, drawerId, unit, packSize,
    packUnit }`
  - `InventoryResponseSchema`: `{ drawers, items, members, me: MemberDto,
    suggestions, serverTime }`
  - `CreateItemBodySchema`: ItemDto minus `createdBy`, `updatedBy`,
    `createdAt`, `updatedAt`. `id` is a uuid.
  - `PatchItemBodySchema`: partial of the editable fields
  - `TakeBodySchema`: `{ amount?: number }`
  - `RestoreBodySchema`: `{ quantity?: number }`
  - `CreateDrawerBodySchema`: `{ name }`
  - `PatchDrawerBodySchema`: `{ name }`
  - `DrawerOrderBodySchema`: `{ ids: string[] }`
  - `PatchMeBodySchema`: `{ displayName }`
  - `RecipesBodySchema`: `{ preference?: string, today: IsoDate }`
  - `RecipeSchema`: `{ name, minutes, uses: { name: string; itemId: string|null;
    status: ExpiryStatus|null }[], alsoNeed: string[], method: string }`
  - `RecipesResponseSchema`: `{ recipes: Recipe[] }`, length exactly 3
  - `ApiErrorSchema`: `{ error: { code: string; message: string; details?: unknown } }`
  - `type ApiErrorCode = 'validation_failed'|'not_found'|'conflict'|'unauthorized'|'forbidden'|'drawer_limit'|'last_drawer'|'drawer_gone'|'ai_limit'|'empty_freezer'|'recipes_failed'`
- Produces `parseDecimal(input: string): number | null` in `shared/decimal.ts`.

- [ ] **Step 1: Write failing tests.** `CreateItemBodySchema`:
  - accepts a valid kg item with `packSize: null`
  - rejects `packSize` with unit `kg`
  - rejects a non-integer quantity for counted units (`1.5` with `bag`)
  - rejects quantity `0`
  - rejects `bestBefore` before `frozenOn`
  - trims a name of `"  Peas  "` to `"Peas"`
  - rejects a 61-character name and a 201-character note
  - rejects an unknown category

  `TakeBodySchema` rejects `0` and negative numbers. `parseDecimal`:
  `'0,5'` → `0.5`, `'1.25'` → `1.25`, `' 2 '` → `2`, `'abc'` → `null`,
  `''` → `null`.
- [ ] **Step 2: Run `npm run test:worker`.** Expected: FAIL.
- [ ] **Step 3: Implement both modules.** Put cross-field rules in
  `superRefine`.
- [ ] **Step 4: Run `npm run test:worker`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(shared): add API schemas and decimal parsing`.

### Task 3: Worker skeleton, D1 schema, Access middleware

**Files:**
- Create:
  - `wrangler.jsonc` (exactly as in A§8, with a placeholder `database_id`)
  - `.dev.vars.example`
  - `migrations/0001_init.sql` (verbatim from A§3)
  - `worker/index.ts`, `worker/access.ts`, `worker/errors.ts`, `worker/env.ts`
  - `worker/tsconfig.json`
  - `worker-test/setup.ts`, `worker-test/helpers.ts`
- Modify: `vitest.worker.config.mts` (workers pool, D1 migrations)
- Test: `worker-test/access.test.ts`

**Interfaces:**
- Consumes: Task 2 `ApiErrorCode`.
- Produces:
  - `type AppEnv = { Bindings: Env; Variables: { email: string } }`, where
    `Env` comes from `wrangler types`. Bindings: `DB`, `AI`, `ASSETS`,
    `ENVIRONMENT`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ALLOWED_EMAILS`,
    `DEV_USER_EMAIL?`.
  - `export const app: Hono<AppEnv>` and
    `export default { fetch: app.fetch }` in `worker/index.ts`. Routes are
    mounted under `/api`, and later tasks add routers via
    `app.route('/api/…', router)`.
  - `accessAuth(): MiddlewareHandler<AppEnv>` sets `c.var.email` and upserts
    `members` (`INSERT … ON CONFLICT(email) DO NOTHING`, with the display name
    from the email as in D§4.7: `thomas.vanhoutte@x` → `Thomas`).
  - `setJwksForTesting(jwks: JWTVerifyGetKey | null): void`
  - `apiError(c, status: number, code: ApiErrorCode, message: string, details?): Response`,
    plus an `app.onError` that maps `ZodError` → `400 validation_failed`
  - `worker-test/helpers.ts`:
    - `signTestJwt(claims: { email: string; aud?: string; iss?: string; expSecondsFromNow?: number }): Promise<string>`
    - `api(path, init?, envOverrides?)`, which calls `app.request` with the
      test env (`ENVIRONMENT: 'local'`, `DEV_USER_EMAIL: 'thomas@example.com'`,
      `ALLOWED_EMAILS: 'thomas@example.com,partner@example.com'`)

- [ ] **Step 1: Configure the pool.** Set up `@cloudflare/vitest-pool-workers`
  with `wrangler.configPath`. Read migrations with `readD1Migrations` into a
  `TEST_MIGRATIONS` binding. `setup.ts` applies them with `applyD1Migrations`.
  Mock `AI` with a binding that the tests stub. Generate `Env` with
  `npx wrangler types`.
- [ ] **Step 2: Write failing tests** in `access.test.ts`. Run them with
  `ENVIRONMENT: 'production'`, `ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com'`,
  `ACCESS_AUD: 'aud-1'`, and a local JWKS from a generated RS256 key pair:
  - no header → `401 unauthorized`
  - valid token → `200` on `GET /api/health` (`{ ok: true }`)
  - wrong `aud` → `401`
  - wrong `iss` → `401`
  - expired token → `401`
  - valid token, but email `stranger@example.com` → `403 forbidden`
  - `ENVIRONMENT: 'production'` with `DEV_USER_EMAIL` set and no header → `401`
    (the bypass is off)
  - `ENVIRONMENT: 'local'` with no header → `200`, and the `members` row for
    `thomas@example.com` exists with display name `Thomas`
- [ ] **Step 3: Run `npm run test:worker`.** Expected: FAIL.
- [ ] **Step 4: Implement.** `access.ts` uses `jwtVerify` with `issuer`
  `https://${ACCESS_TEAM_DOMAIN}` and `audience` `ACCESS_AUD`. The JWKS is
  `createRemoteJWKSet(new URL('https://<team>/cdn-cgi/access/certs'))`, cached
  in module scope. Compare emails case-insensitively against
  `ALLOWED_EMAILS.split(',')`. Add `GET /api/health`.
- [ ] **Step 5: Run `npm run test:worker`.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(worker): add Hono skeleton, D1 schema and Access auth`.

### Task 4: Inventory and item routes

**Files:**
- Create: `worker/db.ts`, `worker/routes/inventory.ts`,
  `worker/routes/items.ts`
- Test: `worker-test/items.test.ts`, `worker-test/inventory.test.ts`

**Interfaces:**
- Consumes: Task 2 schemas; Task 3 `app`, `accessAuth`, `apiError`, `api()`.
- Produces: the routes in A§4 for inventory and items.
  `rowToItemDto(row): ItemDto` is in `worker/db.ts`.
  - `POST /api/items` → `201 ItemDto`
  - `PATCH /api/items/:id` → `200 ItemDto`
  - `POST /api/items/:id/take` → `200 { item: ItemDto } | { deleted: true, item: ItemDto }`.
    The deleted variant carries the last state for undo.
  - `DELETE /api/items/:id` → `204`
  - `POST /api/items/:id/restore` → `200 ItemDto`

- [ ] **Step 1: Write failing tests.**
  - Create sets `createdBy` and `updatedBy` to the caller's email.
  - Creating with an existing id → `409 conflict`.
  - Creating with an unknown or deleted `drawerId` → `400 validation_failed`.
  - `GET /api/inventory` returns:
    - only active items, ordered by `bestBefore`
    - `drawers` ordered by `position`
    - `me.displayName === 'Thomas'`
    - `suggestions` with one entry per case-insensitive name, holding the
      most recently updated values, including names that only exist on
      deleted items
  - Take on 3 bags → quantity 2. Take on 1 bag → `{ deleted: true }`, and the
    item is gone from the inventory.
  - Two takes fired with `Promise.all` on 2 bags → both succeed, and the item
    is deleted.
  - Review Focus 3: take 1 on 0.8 kg → `{ deleted: true }` with
    `item.quantity === 0`.
  - Take `amount: 1.5` on a bag → `400`.
  - Review Focus 4: PATCH or take on a soft-deleted item → `404 not_found`.
  - Delete, then restore → active again with the original quantity. Restore
    with `{ quantity: 1 }` after a take to zero → quantity 1. Restoring when
    the item's drawer is deleted → `409 drawer_gone`.
  - PATCH that changes `category` keeps `bestBefore` (the server never
    recomputes it).
- [ ] **Step 2: Run `npm run test:worker`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Take uses the single `UPDATE … RETURNING`
  statement from A§4. Validate integer amounts for counted units before
  running it, which needs the unit, so read first. A read followed by the
  atomic update is fine: the update is still atomic on quantity.
- [ ] **Step 4: Run `npm run test:worker`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(worker): add inventory and item routes`.

### Task 5: Drawer and member routes

**Files:**
- Create: `worker/routes/drawers.ts`, `worker/routes/me.ts`
- Test: `worker-test/drawers.test.ts`, `worker-test/me.test.ts`

**Interfaces:**
- Consumes: Task 3 and Task 4 helpers.
- Produces:
  - `POST /api/drawers` → `201 DrawerDto`, with position = max + 1
  - `PATCH /api/drawers/:id` → `200 DrawerDto`
  - `PUT /api/drawers/order` → `200 DrawerDto[]`
  - `DELETE /api/drawers/:id?moveTo=` → `204`
  - `PATCH /api/me` → `200 MemberDto`

- [ ] **Step 1: Write failing tests.**
  - Creating the 11th active drawer → `409 drawer_limit`.
  - Order with an id set that doesn't equal the active set → `400`.
  - Deleting a drawer with items and no `moveTo` → `400 validation_failed`.
    With `moveTo` → the items move and the drawer is gone, in one `batch`.
  - `moveTo` equal to the drawer itself, or to a deleted drawer → `400`.
  - Deleting the only remaining drawer → `409 last_drawer`.
  - `PATCH /api/me` with `"  Kim "` → `displayName: 'Kim'`. A 31-character
    name → `400`.
- [ ] **Step 2: Run `npm run test:worker`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Use `DB.batch([...])` for the delete-and-move.
- [ ] **Step 4: Run `npm run test:worker`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(worker): add drawer and member routes`.

### Task 6: Recipes route (Workers AI)

**Files:**
- Create: `worker/recipes/prompt.ts`, `worker/routes/recipes.ts`
- Test: `worker-test/recipes.test.ts`

**Interfaces:**
- Consumes: `expiryStatus`, `RecipesBodySchema`, `RecipesResponseSchema`.
- Produces:
  - `RECIPE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'`
  - `RECIPE_DAILY_CAP = 20`
  - `buildRecipePrompt(items: ItemDto[], today: IsoDate, preference?: string): { messages: {role:'system'|'user'; content:string}[] }`
  - `RECIPE_JSON_SCHEMA`
  - `POST /api/recipes` → `200 RecipesResponse`

- [ ] **Step 1: Write failing tests.** Stub `env.AI.run`.
  - Happy path:
    - 3 recipes returned
    - `uses` name `"minced BEEF"` matches the item "Minced beef" → `itemId`
      set and `status: 'use-soon'` for an item 4 days out
    - an unknown name → `itemId: null`
  - The user message lists items as JSON with expired and use-soon items
    first. The preference is included verbatim and capped at 100 characters
    by the schema.
  - The 21st call on the same UTC day → `429 ai_limit`, with no AI call.
  - The counter increments before the AI call (check with an AI stub that
    throws).
  - An empty freezer → `400 empty_freezer`, with no AI call and no counter
    increment.
  - The first AI response is invalid (2 recipes) and the second is valid →
    `200`, with `AI.run` called twice.
  - Both responses invalid → `502 recipes_failed`.
  - The AI throws an error whose message matches `/neuron|allocation|quota|limit/i`
    → `429 ai_limit`. *Verify* the real error text in the Workers AI docs and
    update the pattern.
- [ ] **Step 2: Run `npm run test:worker`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Call `env.AI.run(RECIPE_MODEL, { messages,
    response_format: { type: 'json_schema', json_schema: RECIPE_JSON_SCHEMA } })`.
  - Treat a string `response` as JSON and parse it. Then validate with zod.
  - Use the counter upsert
    `INSERT … ON CONFLICT(day) DO UPDATE SET count = count + 1 RETURNING count`.
  - The system prompt follows A§6: quick home cooking, expiring first, common
    extra ingredients, a 1–2 sentence method.
- [ ] **Step 4: Run `npm run test:worker`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(worker): add recipe suggestions via Workers AI`.

### Task 7: Remove Firebase, frontend foundation and store

**Files:**
- Delete:
  - `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`
  - `.github/workflows/firebase-hosting-*.yml`
  - `src/app/firebase.config.ts`
  - `src/app/{services,guards,models,constants,utils,components}/`
  - `src/app/app.html`, `src/app/app.scss`
- Modify:
  - `package.json`: remove `firebase` and `@angular/fire`; add
    `@fontsource/manrope`; add `concurrently`; scripts `dev`,
    `db:migrate:local`
  - `angular.json`: remove the `fileReplacements`; add `"proxyConfig"` to
    `serve`; add the `styles` entries
  - `src/app/app.ts`, `src/app/app.config.ts`, `src/app/app.routes.ts`,
    `src/index.html`, `src/styles.scss`
- Create:
  - `proxy.conf.json`
  - `src/styles/{tokens,base,glass}.scss`
  - `src/app/strings.ts`
  - `src/app/core/{format.ts,api.client.ts,inventory.store.ts,theme.service.ts,toast.service.ts}`
  - `src/app/ui/{tab-bar,toast-host}/…`
  - placeholder pages `src/app/features/{freezer,recipes,settings}/*.page.ts`
- Test:
  - `src/app/core/inventory.store.spec.ts`
  - `src/app/core/theme.service.spec.ts`
  - `src/app/core/format.spec.ts`
  - replace `src/app/app.spec.ts`

**Interfaces:**
- Consumes: all `shared/` exports, through `@shared/*`.
- Produces:
  - `ApiClient` (`@Injectable root`): `get<T>(path)`, `post<T>(path, body?)`,
    `patch<T>(path, body)`, `put<T>(path, body)`, `delete(path)`. All return
    `Promise<T>`. On a non-2xx response they throw `ApiError { status:
    number; code: ApiErrorCode | 'network' | 'session_expired'; message:
    string }`. Task 11 adds the session-expiry detection.
  - `InventoryStore` (`@Injectable root`):
    - state signals: `drawers`, `items`, `members`, `me`, `suggestions`,
      `loaded`
    - writable signals: `search`, `category: CategoryKey|null`,
      `grouping: 'drawer'|'date'`
    - `today: Signal<IsoDate>`, refreshed on each `refresh()`
    - `itemViews: Signal<ItemView[]>`, where `ItemView = ItemDto &
      { status: ExpiryStatus; daysLeft: number; drawerName: string;
      addedByName: string }`
    - `filteredItems: Signal<ItemView[]>`: search over name and notes, plus
      the category; sorted by `bestBefore`
    - `useFirst: Signal<ItemView[]>`: expired then use-soon; **ignores** search
      and category
    - `groups: Signal<{ drawer: DrawerDto; items: ItemView[] }[]>`: built from
      `filteredItems`, ordered by drawer position, empty drawers included
    - methods:
      - `refresh(): Promise<void>`
      - `startPolling(): void`, which refreshes now, every 30 000 ms while
        `document.visibilityState === 'visible'`, and on `visibilitychange`
        to visible
      - `stopPolling(): void`
      - `createItem(body: CreateItemBody): Promise<void>`
      - `updateItem(id: string, patch: PatchItemBody): Promise<void>`
      - `takeOut(id: string, amount?: number): Promise<{ deleted: boolean; item: ItemDto }>`
      - `deleteItem(id: string): Promise<ItemDto>`
      - `restoreItem(item: ItemDto, quantity?: number): Promise<void>`
      - `createDrawer(name)`, `renameDrawer(id, name)`,
        `reorderDrawers(ids)`, `deleteDrawer(id, moveTo?)`,
        `setDisplayName(name)`, all `Promise<void>`

    Every mutation updates the signals first, then calls the API. On failure
    it restores the previous signals, calls `ToastService.show({ message })`,
    calls `refresh()`, and rethrows.
  - `ToastService`: `show(t: { message: string; actionLabel?: string;
    action?: () => void; durationMs?: number })` (default 5000 ms),
    `current: Signal<Toast|null>`
  - `ThemeService`: `mode: Signal<'system'|'light'|'dark'>`, `cycle(): void`
    (system → light → dark → system), stored under `localStorage` key
    `freeza-theme` inside try/catch. Sets `document.documentElement.dataset.theme`
    (removed for `system`) and updates `meta[name=theme-color]` with
    `--bg-solid`.
  - `format.ts`: `formatDate(d: IsoDate): string` (`dd/MM/yyyy`),
    `formatShortDate(d): string` (`dd/MM`),
    `formatNumber(n: number): string` (`nl-BE`, max 2 decimals),
    `formatQuantity(item: ItemDto): string` ("2 × 500 g", "0,8 kg",
    "6 pieces"), `formatDaysLeft(days: number): string` ("Expired", "Today",
    "4 days", "3 months" from 60 days on, rounded down to whole months)
  - `strings.ts`: `export const S` with every UI string. It includes verbatim:
    - "Your freezer is empty – tap + to add the first item."
    - "Nothing matches '{q}'."
    - "Offline – changes are disabled"
    - "Session expired – tap to sign in again"
    - "Recipe ideas are resting for today – try again tomorrow."
    - "Couldn't think of anything – try again."
    - "What can I make?"
  - Routes: `''` → `FreezerPage`, `'recipes'` → `RecipesPage`,
    `'settings'` → `SettingsPage`, all lazy (`loadComponent`). `**` redirects
    to `''`.
  - The app shell (`app.ts`) shows the snow layer, `<router-outlet>`,
    `<app-tab-bar>` and `<app-toast-host>`. It calls `store.startPolling()`.
    The tab bar's `+` emits `add` and navigates to `/?add=1`.

- [ ] **Step 1: Remove Firebase.** Delete the files and dependencies above.
  `npm install` must succeed without `--legacy-peer-deps`.
- [ ] **Step 2: Write failing tests.**
  - `format.spec.ts`:
    - `formatDate('2026-11-05')` → `'05/11/2026'`
    - `formatNumber(0.5)` → `'0,5'`
    - `formatQuantity` → `'2 × 500 g'`
    - `formatDaysLeft`: `-1` → `'Expired'`, `0` → `'Today'`, `4` →
      `'4 days'`, `95` → `'3 months'`
  - `theme.service.spec.ts`:
    - `cycle` goes through system → light → dark → system and persists
    - a `localStorage` that throws doesn't break construction
  - `inventory.store.spec.ts`, with `HttpTestingController` or a fake
    `ApiClient`:
    - `useFirst` ignores the search
    - `groups` include empty drawers in position order
    - `takeOut` is optimistic (the quantity drops before the API responds)
    - Review Focus 4: `updateItem` that gets `404` restores the previous
      item, shows a toast and refreshes
    - polling calls `refresh` again after 30 s with fake timers, and not while
      hidden
  - `app.spec.ts`: the shell renders a tab bar with "Freezer" and "Recipes".
- [ ] **Step 3: Run `npm test`.** Expected: the new specs FAIL.
- [ ] **Step 4: Implement.**
  - Copy the tokens from D§6.2 exactly, including the `:root` / dark /
    `[data-theme]` cascade in A§7 and the `--cat-*` colours. Add the glass
    mixin with the `@supports not (backdrop-filter: blur(1px))` fallback, and
    the typography from D§6.3.
  - Add a global `:focus-visible` ring (2 px `--accent`, 2 px offset). The
    toast host uses `aria-live="polite"`.
  - Check every text/background token pair in both themes with a contrast
    tool. Adjust the values that fail WCAG AA in `tokens.scss` and in
    D§6.2, in the same commit.
  - `index.html` gets the inline theme script, `<meta name="theme-color">`
    and `viewport-fit=cover`.
  - `app.config` gets `provideZonelessChangeDetection()`,
    `provideHttpClient(withFetch())` and `provideRouter(routes)`.
  - `proxy.conf.json` sends `/api` → `http://localhost:8787`.
  - `npm run dev` runs `concurrently "wrangler dev" "ng serve"`.
- [ ] **Step 5: Run `npm test && npm run build`.** Expected: PASS, and the
  build stays within the existing budgets.
- [ ] **Step 6: Commit** `refactor: replace Firebase with Cloudflare API client, store and Glacier theme`.

### Task 8: Freezer page

**Files:**
- Create:
  - `src/app/features/freezer/freezer.page.{ts,html,scss}`
  - `src/app/features/freezer/{item-card,use-first-strip,drawer-group,category-chips}/…`
  - `src/app/ui/empty-state/…`
- Test: `src/app/features/freezer/freezer.page.spec.ts`,
  `src/app/features/freezer/item-card/item-card.spec.ts`

**Interfaces:**
- Consumes: `InventoryStore`, `ThemeService`, `format.ts`, `S`, `CATEGORIES`.
- Produces:
  - `ItemCardComponent`: inputs `item: ItemView`; outputs `open: ItemView`,
    `take: ItemView`
  - `FreezerPage` opens the item sheet (Task 9) through
    `ItemSheetService.open(item?: ItemDto)` and the take-out sheet through
    `TakeOutSheetService.open(item)`. In this task, inject them from an
    interface token with a no-op default, so Task 9 can provide them.

- [ ] **Step 1: Write failing tests.**
  - Card:
    - shows the name, "2 × 500 g · 09/11/2026", and a chip with the text
      "4 days"
    - the − button has `aria-label` "Take one Minced beef out" and emits
      `take`
    - the colour bar uses `var(--cat-meat)`
  - Page:
    - with an empty store → the empty-freezer string
    - with a search of "xyz" and no match → "Nothing matches 'xyz'."
    - the Use first strip hides when empty and shows the count when not
    - grouping toggled to `date` → one flat list sorted by best before
    - the category chip "Fish" filters to fish only
    - "All" clears the filter
    - the top bar theme button calls `theme.cycle()`
    - the settings button navigates to `/settings`
    - visiting `/?add=1` opens the item sheet with no item
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** to D§5.1 and the Glacier tokens:
  - cards with an 18 px radius, glass and a 44 px − button
  - chips that scroll horizontally
  - the Use first tiles coloured with `--soon` / `--expired`
  - a layout centred at max 560 px (D§5.5)
  - safe-area padding
  - icons from `lucide-angular`. If its peer range excludes Angular 21, use a
    small inline-SVG `IconComponent` instead and note it in the commit.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): add freezer inventory page`.

### Task 9: Add/edit sheet, take-out sheet, undo

**Files:**
- Create:
  - `src/app/features/item-sheet/{item-sheet.component,item-sheet.service,take-out-sheet.component,take-out-sheet.service}.*`
  - `src/app/ui/{sheet,stepper}/…`
- Test:
  - `src/app/features/item-sheet/item-sheet.component.spec.ts`
  - `src/app/features/item-sheet/take-out.spec.ts`

**Interfaces:**
- Consumes: the store methods, `suggestBestBefore`, `isCountedUnit`,
  `parseDecimal`, `todayLocal`, `S`.
- Produces: `ItemSheetService.open(item?: ItemDto): void` and
  `TakeOutSheetService.open(item: ItemView): void`, provided in `app.config`
  and replacing Task 8's no-op token. `FreezerPage.take(item)` calls
  `store.takeOut(id)` directly for counted units and opens the take-out sheet
  for measured units.

- [ ] **Step 1: Write failing tests.**
  - New item: frozen on = today. Best before = `suggestBestBefore(today,
    'meat')` with a "suggested" hint. Changing the category to fish updates
    best before.
  - After editing best before by hand, changing the category doesn't change
    it, and `bestBeforeManual: true` is sent.
  - Typing "Min" lists the suggestion "Minced beef". Picking it fills category,
    drawer, unit and pack size.
  - Review Focus 5: a suggestion whose `drawerId` isn't active → the drawer
    falls back to `drawers()[0]`.
  - Pack size is visible only for counted units. Switching to `kg` clears it.
  - Review Focus 2: quantity "0,5" with `kg` → submitted as `0.5`.
  - Save is disabled while the form is invalid. A new item is submitted with
    a `crypto.randomUUID()` id.
  - Edit mode shows "Delete". Delete calls `store.deleteItem`, closes, and
    shows the toast "Deleted Minced beef" with action "Undo", which calls
    `restoreItem` with the returned item.
  - Take-out on a counted item at quantity 1 → toast "Took the last Peas out"
    + "Undo" → `restoreItem(item, 1)`.
  - Take-out sheet for kg: "0,3" → `takeOut(id, 0.3)`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** to D§5.2 and D§6.6:
  - The sheet slides up over 220 ms with ease-out (instant under reduced
    motion). It has a sticky Save and closes on Escape and on a backdrop tap.
  - Use typed reactive forms.
  - Number fields are `type="text" inputmode="decimal"`, parsed with
    `parseDecimal`.
  - Name suggestions are a listbox under the name field
    (`role="listbox"`, arrow-key navigation).
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): add item sheet, take-out and undo`.

### Task 10: Recipes and Settings pages

**Files:**
- Create: `src/app/features/recipes/recipes.page.*`,
  `src/app/features/settings/settings.page.*`
- Test: `src/app/features/recipes/recipes.page.spec.ts`,
  `src/app/features/settings/settings.page.spec.ts`

**Interfaces:**
- Consumes: `ApiClient`, `InventoryStore`, `ThemeService`, `S`,
  `RecipesResponse`.
- Produces: none for later tasks. The last recipe result is stored under
  `localStorage` key `freeza-recipes`, inside try/catch.

- [ ] **Step 1: Write failing tests.**
  - Recipes:
    - "What can I make?" posts `{ preference, today }`, shows 3 skeleton cards
      while pending, then 3 cards with name, "25 min", uses (use-soon ones
      carrying a `.soon` class), "You'll also need" and the method
    - `429 ai_limit` → the resting message
    - `502` or a network error → the "Couldn't think of anything" message
    - `400 empty_freezer` → the empty-freezer string with the button disabled
    - the last result is restored on reload
  - Settings:
    - Theme radio System/Light/Dark sets the `ThemeService` mode
    - the display name saves through `setDisplayName`
    - drawers can be renamed, reordered with up/down buttons, and added; Add
      is disabled at 10
    - removing a drawer with items asks for a target drawer (select) and then
      calls `deleteDrawer(id, moveTo)`
    - the remove button is disabled when only one drawer is left
    - the app version is shown from `package.json` `version`
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** to D§4.6, §5.3 and §5.4. The skeleton shimmer is
  disabled under reduced motion. Add `ThemeService.setMode(mode)` if the radio
  needs it (a small addition to Task 7's service).
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(app): add recipes and settings pages`.

### Task 11: PWA, offline and session expiry

**Files:**
- Create:
  - `ngsw-config.json`
  - `src/manifest.webmanifest`
  - `public/icons/{icon-192,icon-512,maskable-512}.png`, generated from an
    SVG snowflake on the light gradient (D§6.5)
  - `src/app/core/connectivity.service.ts`
  - `src/app/ui/offline-banner/…`
- Modify: `angular.json` (`serviceWorker`), `src/index.html` (manifest link),
  `src/app/app.config.ts` (`provideServiceWorker`),
  `src/app/core/api.client.ts`, `src/app/app.ts`
- Test: `src/app/core/api.client.spec.ts`,
  `src/app/core/connectivity.service.spec.ts`

**Interfaces:**
- Consumes: `ApiClient`, `InventoryStore`, `S`.
- Produces:
  - `ConnectivityService.online: Signal<boolean>`
  - an `ApiError` code of `'session_expired'`
  - the store and pages read `online()` to disable add, edit, − and recipes

- [ ] **Step 1: Write failing tests.**
  - `ApiClient` throws `session_expired` when:
    - the response has `redirected === true`
    - the response has `type === 'opaqueredirect'`
    - a `TypeError` fetch failure happens while `navigator.onLine` is true
  - It throws `network` for a `TypeError` while offline.
  - The shell shows "Session expired – tap to sign in again" on
    `session_expired`, and tapping it calls `location.reload()`.
  - `ConnectivityService` follows `online` / `offline` events.
  - While offline, the banner shows "Offline – changes are disabled", and the
    tab bar `+` and the card − are disabled.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `ngsw-config.json`:
    - an `app` assetGroup with `prefetch` covering the index, JS, CSS and
      Manrope fonts
    - a `dataGroups` entry for `/api/inventory` with `strategy: freshness`,
      `timeout: 3s`, `maxAge: 7d`, `maxSize: 1`
    - nothing else under `/api` is cached
  - The manifest: `name` "Freeza", `display: standalone`,
    `background_color`/`theme_color` `#bfe3f7`, and the icons including
    `purpose: maskable`.
  - `fetch` uses `redirect: 'manual'` for `/api`, so an Access redirect
    surfaces as `opaqueredirect`.
- [ ] **Step 4: Run `npm test && npm run build`.** Expected: PASS, and
  `dist/freeza/browser/ngsw.json` exists.
- [ ] **Step 5: Commit** `feat(app): add PWA, offline mode and session-expiry handling`.

### Task 12: CI/CD, E2E smoke tests, README setup guide

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`,
  `playwright.config.ts`, `e2e/smoke.spec.ts`
- Modify: `package.json` (`e2e`, `deploy` scripts), `README.md` (rewrite)

**Interfaces:**
- Consumes: everything.
- Produces: none.

- [ ] **Step 1: Write the E2E tests** (Playwright, an iPhone 14 device
  profile). `webServer` runs `npm run build && wrangler d1 migrations apply
  freeza-db --local && wrangler dev --port 8787` with `.dev.vars`
  `ENVIRONMENT=local`. The tests:
  - add "Peas", 2 bags, Drawer 2 → it appears under Drawer 2
  - − twice → it's gone, then Undo → it's back with quantity 1
  - search "pea" shows it; search "xyz" shows "Nothing matches 'xyz'."
  - the theme toggle to dark survives a reload (`html[data-theme=dark]`)
- [ ] **Step 2: Run `npm run e2e`.** Expected: PASS.
- [ ] **Step 3: Write the workflows** per A§10.
  - `ci.yml` (pull_request): Node 22, `npm ci`, `npx tsc -p worker`,
    `npm test`, `npm run build`. No deploy.
  - `deploy.yml` (push to `main`): the same checks, then
    `cloudflare/wrangler-action@v4` with `apiToken:
    ${{ secrets.CLOUDFLARE_API_TOKEN }}` and `accountId:
    ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`. It runs
    `d1 migrations apply freeza-db --remote`, then `deploy`.
  - `npm run deploy` runs the same two commands locally.
- [ ] **Step 4: Rewrite `README.md`.** Sections:
  - What Freeza is
  - Local development: `.dev.vars` from `.dev.vars.example`, `npm run dev`
  - One-time Cloudflare setup, starting from scratch:
    1. Add the `ki-tho.be` zone, if it isn't on Cloudflare yet.
    2. `wrangler d1 create freeza-db`, then put the id in `wrangler.jsonc`.
    3. Create the Zero Trust organisation and team name.
    4. Enable the one-time PIN login method.
    5. Create the Access application for `freeza.ki-tho.be`, with an allow
       policy for the two emails and a 1-month session.
    6. Copy the team domain and AUD tag into `wrangler.jsonc` `vars`.
    7. Set `ALLOWED_EMAILS` as a dashboard variable.
    8. Create an API token (Workers Scripts:Edit, D1:Edit, Workers AI) and add
       the GitHub secrets.
  - Deploying
  - Decommissioning Firebase: delete the `freeza-inventory` project and the
    `FIREBASE_SERVICE_ACCOUNT_FREEZA_INVENTORY` secret
- [ ] **Step 5: Run `npm test && npm run build && npm run e2e`.** Expected:
  PASS.
- [ ] **Step 6: Commit** `ci: add Cloudflare deploy pipeline, e2e smoke tests and setup guide`.
