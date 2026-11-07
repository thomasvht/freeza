# Freeza – agent guide

A freezer inventory PWA for one household (two users, phones first). Angular 22
frontend and a Cloudflare Worker API with D1, behind Cloudflare Access.

- Product and visual design: [DESIGN.md](DESIGN.md)
- Technical design: [ARCHITECTURE.md](ARCHITECTURE.md)

Read the relevant section before changing behaviour, data, or styling. If a
change contradicts either document, update the document in the same change or
ask first.

> **Status:** the Cloudflare version is implemented; see [README.md](README.md) for setup.

## Commands

| Task | Command |
|---|---|
| Dev (app + API) | `npm run dev`. App on :4200, API on :8787 |
| Apply local DB migrations | `npm run db:migrate:local` |
| All tests | `npm test` |
| E2E | `npm run e2e` |
| Build | `npm run build` |
| Regenerate binding types | `npx wrangler types` |

Run `npm test` and `npm run build` before you say a change is done.

## Layout

- `src/`: the Angular app.
  - `app/core/`: API client, store, services.
  - `app/features/`: pages and sheets.
  - `app/ui/`: shared components.
  - `app/strings.ts`: all UI text.
  - `styles/`: tokens and the glass mixin.
- `worker/`: the Hono API. `access.ts` is the auth middleware.
- `shared/`: code used by both the app and the Worker (categories, units, API
  types and zod schemas, expiry logic). No Angular or Worker imports.
- `migrations/`: D1 SQL migrations, append-only.

## Rules

**Architecture**
- Don't add Firebase, an in-app login, accounts or passwords. Cloudflare
  Access is the only gate.
- Every API route goes through the Access middleware. The local-dev bypass
  works only when `ENVIRONMENT === "local"`. Never widen that condition.
- Keep business rules in `shared/`: expiry status (one 14-day threshold),
  shelf-life suggestions, units. Don't duplicate them in components or routes.
- Validate every request body with the zod schemas in `shared/api-types.ts`.
- Mind the free-tier limits (ARCHITECTURE.md §1): keep the Worker thin, and
  never call Workers AI outside the capped `/api/recipes` route.

**Data**
- Calendar dates are `YYYY-MM-DD` strings everywhere: DB, API and store. Never
  pass `Date` objects across the API. Timestamps are ISO-8601 UTC strings.
- Never edit a migration that has been applied remotely. Add a new one.
- Deletes are soft (`deleted_at`). Taking out the last unit uses the atomic
  `take` route, never a read-then-write.

**Angular**
- Standalone components, zoneless, signals, `OnPush`, `@if`/`@for`. No
  NgModules, no `zone.js`, no `CommonModule` imports.
- State lives in `InventoryStore`. Components read signals and call store
  methods. Mutations are optimistic, with rollback and a toast on failure.
- Typed reactive forms only.

**Formats and locale**
- Show dates as `dd/MM/yyyy` (`dd/MM` when compact) and numbers with a decimal
  comma, via `core/format.ts`.
- Units are metric only: piece, portion, bag, box, g, kg, ml, l.
- UI text is English and kept in one strings file.

**Styling**
- Use only the design tokens from `styles/tokens.scss` (DESIGN.md §6). No raw
  colours in components.
- Every new text/background pair must pass WCAG AA in both light and dark
  mode.
- Glass goes through the glass mixin, which carries the no-`backdrop-filter`
  fallback.
- Touch targets are at least 44 × 44 px. Respect safe-area insets and
  `prefers-reduced-motion`.

**Testing**
- New logic in `shared/` or `worker/` comes with tests. Worker tests run in
  `@cloudflare/vitest-plugin` and mock `env.AI`.
- Bug fixes start with a failing test.

**Git**
- Use Conventional Commits (`feat:`, `fix:`, `chore:`, …).
- Don't commit `.dev.vars`, personal email addresses, or the
  `.superpowers/` folder.
