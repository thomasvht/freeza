# Freeza – Architecture

The technical design for the Cloudflare version of Freeza. Product and visual
design are in [DESIGN.md](DESIGN.md). Agent working rules are in
[CLAUDE.md](CLAUDE.md).

Decisions marked **(decided)** came from the owner. Everything else is the
author's call and can be changed. Facts about Cloudflare were checked against
developers.cloudflare.com on 05/11/2026; items marked *verify* weren't confirmed
and must be checked during implementation.

## 1. Overview

```
 Phone (Angular PWA)
   │  HTTPS, CF_Authorization cookie
   ▼
 Cloudflare Access  ── email one-time PIN, allow-list of 2 emails   (decided)
   │  adds Cf-Access-Jwt-Assertion header
   ▼
 Worker "freeza"
   ├─ /api/*   → Hono API (runs first) ──► D1 "freeza-db"
   │                                   └─► Workers AI (recipes)
   └─ /*       → Static Assets (Angular build, SPA fallback)
```

The app is served at **`https://freeza.ki-tho.be`** **(decided)** as a Worker
custom domain.

- **One Worker** serves both the Angular build (Workers Static Assets) and a
  JSON API under `/api`. There is no separate Pages project. API and app share
  one origin, so there's no CORS.
- **D1** (SQLite) holds the shared inventory.
- **Cloudflare Access** is the only gate **(decided)**. The app has no login
  code. The Worker verifies the Access JWT on every API call and uses its
  `email` claim as the user's identity.
- **Workers AI** generates recipe ideas, within the free daily allowance
  **(decided: free option)**.
- **Firebase is removed entirely (decided):** Hosting, Firestore, Auth,
  `@angular/fire`, `firebase`, the rules and the workflows.

### Free-tier budget

| Service | Free limit | Freeza use |
|---|---|---|
| Workers | 100,000 requests/day; 10 ms CPU per request | 2 users × polling every 30 s while open ≈ a few thousand requests/day |
| D1 | 500 MB per database, 5 GB per account, 50 queries per invocation | Kilobytes |
| Workers AI | 10,000 neurons/day, resets 00:00 UTC; on the free plan requests fail after that | Capped by the app at 20 recipe requests/day (§6) |
| Access | Free for small teams (*verify*: commonly 50 users) | 2 users |

The 10 ms CPU limit matters. JWT verification (RS256) and the D1 queries fit.
Waiting on D1 or AI doesn't count as CPU time. Avoid heavy JSON work in the
Worker.

## 2. Repository layout

One npm package, one repo.

```
/
├─ CLAUDE.md  ARCHITECTURE.md  DESIGN.md  README.md
├─ wrangler.jsonc               Worker, assets, D1, AI bindings
├─ angular.json  tsconfig*.json package.json
├─ proxy.conf.json              ng serve → wrangler dev (/api)
├─ migrations/                  D1 SQL migrations (0001_init.sql, …)
├─ shared/                      Code used by both the client and the Worker
│  ├─ categories.ts             Category keys, labels, colour tokens, shelf life
│  ├─ units.ts                  Unit keys and rules (counted vs measured)
│  └─ api-types.ts              Request/response types + zod schemas
├─ worker/
│  ├─ index.ts                  Hono app, export default { fetch }
│  ├─ access.ts                 Access JWT middleware
│  ├─ routes/                   inventory.ts items.ts drawers.ts me.ts recipes.ts
│  ├─ db.ts                     D1 helpers (row ↔ DTO mapping)
│  └─ recipes/prompt.ts         Prompt and JSON schema for Workers AI
├─ worker-test/                 Vitest tests run in the Workers runtime
├─ src/                         Angular app
│  ├─ app/
│  │  ├─ core/                  api.client.ts, inventory.store.ts,
│  │  │                         theme.service.ts, connectivity.service.ts, format.ts
│  │  ├─ features/freezer/      freezer page, item card, use-first strip, drawer group
│  │  ├─ features/item-sheet/   add/edit sheet, take-out sheet
│  │  ├─ features/recipes/      recipes page
│  │  ├─ features/settings/     settings page
│  │  └─ ui/                    tab bar, toast, chip, stepper, empty state
│  ├─ styles/                   tokens.scss, base.scss, glass.scss
│  ├─ manifest.webmanifest
│  └─ index.html                Inline theme bootstrap script (no flash)
├─ public/                      Icons (incl. maskable), favicon
├─ e2e/                         Playwright smoke tests
└─ .github/workflows/           ci.yml, deploy.yml
```

`shared/` is imported by both sides through a tsconfig path alias
(`@shared/*`). It must stay free of Angular and Worker imports.

## 3. Data model (D1)

Dates without a time (*frozen on*, *best before*) are stored as `TEXT`
`YYYY-MM-DD`. Timestamps are stored as `TEXT` ISO-8601 UTC. This removes the
whole class of `Date`/`Timestamp` bugs in the old app. The client converts to
`dd/MM/yyyy` only for display.

```sql
-- migrations/0001_init.sql
CREATE TABLE drawers (
  id         TEXT PRIMARY KEY,               -- uuid
  name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 30),
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE items (
  id                 TEXT PRIMARY KEY,       -- uuid, generated by the client
  name               TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  category           TEXT NOT NULL,          -- validated against shared/categories.ts
  drawer_id          TEXT NOT NULL REFERENCES drawers(id),
  quantity           REAL NOT NULL CHECK (quantity >= 0),
  unit               TEXT NOT NULL,          -- piece|portion|bag|box|g|kg|ml|l
  pack_size          REAL,                   -- optional, counted units only
  pack_unit          TEXT,                   -- g|kg|ml|l
  frozen_on          TEXT NOT NULL,          -- YYYY-MM-DD
  best_before        TEXT NOT NULL,          -- YYYY-MM-DD
  best_before_manual INTEGER NOT NULL DEFAULT 0,
  notes              TEXT CHECK (notes IS NULL OR length(notes) <= 200),
  created_by         TEXT NOT NULL,          -- email from Access
  updated_by         TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT                    -- soft delete (undo, suggestions)
);
CREATE INDEX items_active ON items(deleted_at, best_before);

CREATE TABLE members (
  email        TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 30),
  created_at   TEXT NOT NULL
);

CREATE TABLE ai_usage (
  day   TEXT PRIMARY KEY,                    -- YYYY-MM-DD (UTC)
  count INTEGER NOT NULL
);

INSERT INTO drawers (id, name, position, created_at) VALUES
  ('drawer-1','Drawer 1',1,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('drawer-2','Drawer 2',2,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('drawer-3','Drawer 3',3,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
```

- **Soft delete.** `DELETE` sets `deleted_at`. Undo clears it. Taking out the
  last unit sets `deleted_at` in the same statement. Deleted items feed the
  name suggestions. There is no purge job (the data stays tiny).
- **Members** are created on first API call from the Access email. The display
  name defaults to the capitalised part before `.` or `@`.
- **Client-generated ids** (`crypto.randomUUID()`) make optimistic creates
  simple and safe to retry. The server rejects an id that already exists with
  `409`.
- Migrations are append-only. Never edit a migration that has been applied
  remotely.

## 4. API

All routes are under `/api`, take and return JSON, and require a valid Access
JWT (section 5). Request bodies are validated with zod schemas from
`shared/api-types.ts`. Errors use one shape:

```json
{ "error": { "code": "validation_failed", "message": "…", "details": {} } }
```

| Method & path | Purpose |
|---|---|
| `GET /api/inventory` | `{ drawers, items, members, me, suggestions, serverTime }`. Active rows only. `suggestions` holds the latest category, drawer, unit and pack size for each distinct name (including deleted items), capped at 200. One call for polling. |
| `POST /api/items` | Create. Body includes the client-generated `id`. Server sets `created_by`, `updated_by` and the timestamps. |
| `PATCH /api/items/:id` | Partial update. Last write wins. |
| `POST /api/items/:id/take` | `{ amount }`, where `amount` defaults to 1. Atomic, see below. Returns the item, or `{ deleted: true }`. |
| `DELETE /api/items/:id` | Soft delete. |
| `POST /api/items/:id/restore` | Undo a delete or a take-out that removed the item. Restores the quantity sent in the body. |
| `POST /api/drawers` | Create (max 10 active). |
| `PATCH /api/drawers/:id` | Rename. |
| `PUT /api/drawers/order` | `{ ids: [...] }`. Rewrites `position`. |
| `DELETE /api/drawers/:id?moveTo=<id>` | Moves active items, then soft-deletes, in one `batch`. `moveTo` is required when the drawer has items. |
| `PATCH /api/me` | `{ displayName }`. |
| `POST /api/recipes` | `{ preference?, today }`. Returns 3 ideas (section 6). |

**Atomic take-out:**

```sql
UPDATE items
SET quantity   = max(quantity - ?1, 0),
    deleted_at = CASE WHEN quantity - ?1 <= 0 THEN ?2 ELSE deleted_at END,
    updated_by = ?3, updated_at = ?2
WHERE id = ?4 AND deleted_at IS NULL
RETURNING *;
```

**Polling:** the client calls `GET /api/inventory`:
- on start
- on `visibilitychange` to visible
- every 30 s while visible

The response is small. No ETag is needed at this size; add one if it grows.

## 5. Identity and Cloudflare Access

**Access setup** (done by hand in the Zero Trust dashboard; the README gets a
step-by-step section):

0. If needed, create the Zero Trust organisation (free plan) and pick a team
   name. The README covers this from scratch (*builder's call*).
1. Create a self-hosted Access application for **`freeza.ki-tho.be`**
   **(decided)**. The `ki-tho.be` zone must be on Cloudflare. The Worker has
   `workers_dev: false` and preview URLs disabled, so that hostname is the
   only way in.
2. Policy: *Allow* where email is in `{owner, partner}`. Login method: one-time
   PIN.
3. Session duration: 1 month, so phones rarely ask for a new code.
4. Note the **team domain** (`<team>.cloudflareaccess.com`) and the
   application's **AUD tag**. Both go into `wrangler.jsonc` `vars`.

**Worker middleware (`worker/access.ts`):**

- Read the `Cf-Access-Jwt-Assertion` header and verify it with `jose`:
  - `createRemoteJWKSet` on `https://<team>/cdn-cgi/access/certs`
  - `jwtVerify` with `issuer: https://<team>` and `audience: ACCESS_AUD`
- Missing or invalid token → `401`.
- Valid token, but `email` is not in `ALLOWED_EMAILS` → `403`. This is a
  second line of defence if the Access policy is ever widened.
- Put `email` on the Hono context.
- Cache the JWKS in module scope between requests.
- **Local development only:** when `ENVIRONMENT === "local"`, skip
  verification and use `DEV_USER_EMAIL`. That code path must never be reachable
  when `ENVIRONMENT` is anything else. A test asserts this.

**Expired Access session in the PWA:** once the `CF_Authorization` cookie
expires, Access answers API `fetch` calls with a redirect to its login page.
`api.client.ts` fetches with `redirect: 'manual'`, so session expiry is detected
from an `opaqueredirect` (or redirected) response on `/api`, or from a Worker
`401`. It then shows
"Session expired – tap to sign in again", which reloads the page so Access can
run its login flow. Network errors are reported as offline/network, not as an
expired session. The service worker uses the `freshness` navigation strategy
and leaves `/cdn-cgi/**` and `/api/**` out of navigation handling, so the reload
reaches Access.

## 6. Recipes (Workers AI)

- Binding: `"ai": { "binding": "AI" }`.
- Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. It supports JSON mode.
  *Verify* at build time whether there's a newer model with JSON mode, and
  measure its neuron cost per request.
- **Prompt input:**
  - active items, sorted by best before, each with name, quantity, unit and
    status (expired / use soon / fresh, computed from the client-sent `today`)
  - the preference
  - the instructions: exactly 3 quick home-cooking ideas, use expiring items
    first, keep "also need" to common ingredients
- **Output:** `response_format: { type: "json_schema", json_schema }` with this
  shape:

  ```ts
  { recipes: [ { name: string, minutes: number,
                 uses: string[],        // freezer item names
                 alsoNeed: string[],
                 method: string } ] }   // exactly 3
  ```

- **Validation:** parse with zod. On a schema failure or a "JSON Mode couldn't
  be met" error, retry once, then return `502 recipes_failed`. `uses` names are
  matched case-insensitively to current items, so the client can mark the
  expiring ones.
- **Daily cap:** `ai_usage` caps recipe requests at **20/day** (UTC). That
  keeps the neuron allowance for the household and stops runaway costs if the
  account is ever moved to a paid plan. The 21st request, or a Workers AI
  "allowance exceeded" error, returns `429 ai_limit`. Increment `ai_usage` with
  an upsert *before* calling the model.
- If the freezer is empty, return `400 empty_freezer` without calling the
  model.

## 7. Frontend

- **Angular 22:**
  - standalone components
  - zoneless change detection (`provideZonelessChangeDetection`)
  - signals for all state
  - `OnPush` everywhere
  - the new control flow (`@if`, `@for`)
  - no NgModules
- **Routing:** `/` (Freezer), `/recipes`, `/settings`. The add/edit sheet is a
  component in the Freezer page, not a route.
- **`InventoryStore`:**
  - holds `drawers`, `items`, `members`, `me` and `suggestions` as signals
  - exposes `computed` views: filtered items, grouped by drawer, use first,
    counts
  - every mutation updates the signals optimistically, calls the API, rolls
    back and shows a toast on failure, and refetches after success when the
    server returns derived fields
  - polling lives here; each poll tick and each return to the foreground also
    moves "today" on, whether or not the request succeeds
  - drops an inventory response whose `serverTime` is not newer than the one
    last applied (a stale service-worker copy, or an out-of-order refresh); the
    first load is always applied
- **Forms:** reactive forms (typed `FormGroup`). The best-before suggestion is
  computed from `frozen on` + category until the field is dirty.
- **Formatting:** `core/format.ts` wraps `Intl.DateTimeFormat('nl-BE')` for
  `dd/MM/yyyy` and `Intl.NumberFormat('nl-BE')` for the decimal comma. UI text
  is English (DESIGN.md 4.8); the formats are European regardless.
- **"Today":** the browser's local date, as `YYYY-MM-DD`, from one helper. All
  status logic lives in `shared/` (`expiryStatus(bestBefore, today)`), with a
  single 14-day threshold.
- **PWA:** `@angular/service-worker`:
  - `assetGroups` prefetch the app shell and fonts
  - one `dataGroup` for `/api/inventory`: `freshness` strategy, 3 s timeout,
    serves the cached copy when offline
  - `manifest.webmanifest` with `display: standalone`, theme colours and
    maskable icons
  - `connectivity.service.ts` exposes an `online` signal, and the UI
    disables mutations while offline (DESIGN.md 4.5)
- **Theme:** an inline script in `index.html` reads the stored choice from
  `localStorage` (inside try/catch) and sets `data-theme` before Angular boots.
  `ThemeService` owns changes and updates `<meta name="theme-color">`.
- **Styling:**
  - SCSS with CSS custom properties from DESIGN.md 6.2 in
    `styles/tokens.scss`
  - components only use tokens, never raw colours
  - `glass.scss` provides the glass mixin with the `@supports not
    (backdrop-filter: blur(1px))` fallback
- **Fonts and icons:** `@fontsource/manrope` (self-hosted) and `@lucide/angular`.

## 8. Configuration

`wrangler.jsonc` (sketch, the values are filled in during setup):

```jsonc
{
  "name": "freeza",
  "main": "worker/index.ts",
  "compatibility_date": "2026-11-01",
  "routes": [{ "pattern": "freeza.ki-tho.be", "custom_domain": true }],
  "workers_dev": false,
  "preview_urls": false,             // verify key name
  "assets": {
    "directory": "./dist/freeza/browser",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "freeza-db", "database_id": "<id>",
      "migrations_dir": "migrations" }
  ],
  "ai": { "binding": "AI" },
  "vars": {
    "ENVIRONMENT": "production",
    "ACCESS_TEAM_DOMAIN": "<team>.cloudflareaccess.com",
    "ACCESS_AUD": "<aud-tag>"
  }
}
```

- `.dev.vars` (git-ignored) sets `ENVIRONMENT=local` and `DEV_USER_EMAIL` for
  `wrangler dev`.
- Types for bindings are generated with `wrangler types` into
  `worker-configuration.d.ts`.
- Access and AI need no secrets: they are bindings or public values.
- `ALLOWED_EMAILS` (comma-separated) is personal data, so it never goes in the
  repo. Set it as a Worker secret with
  `npx wrangler secret put ALLOWED_EMAILS`; `wrangler deploy` leaves secrets
  alone. Put it in `.dev.vars` for local runs.

## 9. Local development

| Command | What it does |
|---|---|
| `npm run dev` | Runs `wrangler dev` (API on :8787 with local D1 and remote AI) and `ng serve` (:4200, proxies `/api` via `proxy.conf.json`) in parallel |
| `npm run db:migrate:local` | `wrangler d1 migrations apply freeza-db --local` |
| `npm test` | Angular unit tests (Vitest) + Worker tests (`@cloudflare/vitest-plugin`, Miniflare D1) |
| `npm run e2e` | Playwright smoke tests against `wrangler dev` with a built app |
| `npm run build` | `ng build` (production) |
| `npm run deploy` | Migrations `--remote`, then `wrangler deploy` (normally done by CI) |

Workers AI calls in local dev go to the real service and use the daily
allowance. Worker tests mock `env.AI`.

## 10. CI/CD (GitHub Actions)

- **`ci.yml`** (pull requests):
  1. `npm ci` (without `--legacy-peer-deps`: the peer conflict came from
     `@angular/fire`)
  2. type-check
  3. `npm test`
  4. `npm run build`

  There are no per-PR preview deployments in version 1 (*builder's call*). A
  preview version would share the production D1 database and AI allowance,
  and would run before its migrations were applied. Testing happens locally
  and in CI. Disable preview URLs in `wrangler.jsonc` (`"preview_urls":
  false`, *verify* the key), so there's no unprotected hostname.
- **`deploy.yml`** (push to `main`), using `cloudflare/wrangler-action@v4`:
  1. test
  2. build
  3. `wrangler d1 migrations apply freeza-db --remote`
  4. `wrangler deploy`
- **Repository secrets:** `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit, D1:Edit
  and Workers AI permissions) and `CLOUDFLARE_ACCOUNT_ID`.

## 11. Migration from the Firebase app

- **Remove from the repo:**
  - `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`
  - both `firebase-hosting-*.yml` workflows
  - `firebase.config.ts`, `auth.service.ts`, `firebase-data.service.ts`,
    `freezer.service.ts`, `auth.guard.ts`
  - the `login`, `signup` and `auth-shell` components
  - the `environments` file replacement in `angular.json`
  - the `firebase` and `@angular/fire` dependencies
  - the committed `.DS_Store` (and add it to `.gitignore`)
- **Data:** none is migrated. The old data is outdated, and the new app starts
  empty **(decided)**.
- **Outside the repo**, for the owner to do after the switch: delete the
  `freeza-inventory` Firebase project. The
  `FIREBASE_SERVICE_ACCOUNT_FREEZA_INVENTORY` GitHub secret is already
  deleted.
- The existing presentational components (header, item card, filter section,
  form) are rebuilt to the new design rather than ported. Their logic is
  small, and the layout changes completely.

## 12. Testing strategy

- **`shared/`:** unit tests for `expiryStatus` (boundaries: yesterday, today,
  +14 and +15 days), the shelf-life suggestion, and unit rules.
- **Worker:**
  - every route: happy path plus validation errors
  - Access middleware: a valid JWT (test key pair and a mocked JWKS), a wrong
    `aud`, an expired token, an email outside the allow-list, and the local
    bypass disabled when `ENVIRONMENT=production`
  - concurrent `take` calls end at the right quantity
  - recipes: cap reached, empty freezer, invalid AI output retried and then
    `502`
- **Angular:** store logic (optimistic update and rollback, grouping,
  filtering), the item sheet (suggestion rules), and the theme service.
- **E2E (Playwright, phone viewport):**
  - add an item and see it in the right drawer
  - take one out until it's gone, then undo
  - search and filter
  - theme toggle persists across reloads

## 13. Risks

| Risk | Mitigation |
|---|---|
| Glass hurts readability (Glacier was the lowest-contrast option) | Contrast check on every token pair is part of done (DESIGN.md 6.1) |
| Access session expiry breaks the installed PWA silently | Explicit detection and a re-login prompt (section 5) |
| Workers AI model or JSON mode changes | Model id in one constant; zod validation; graceful `502` |
| Free AI allowance used up by other projects on the same account | Daily cap; friendly message |
| 10 ms CPU limit | Keep the Worker thin; JWKS cached; no large JSON transforms |
