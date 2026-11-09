# Freeza

Freeza is a freezer inventory app for two people. It's a phone-first PWA: add what goes into the freezer, see what to use first, take items out with one tap (with undo), and ask for three recipe ideas based on what's in there.

It runs entirely on Cloudflare:

- One Worker serves the Angular 22 build and a Hono API under `/api`.
- D1 stores the data.
- Cloudflare Access (one-time PIN) controls who gets in.
- Workers AI suggests recipes (20 requests a day).

The technical design is in [ARCHITECTURE.md](ARCHITECTURE.md), the product and visual design in [DESIGN.md](DESIGN.md).

## Local development

1. Install dependencies: `npm ci`
2. Copy the example variables and adjust them if you like:

   ```sh
   cp .dev.vars.example .dev.vars
   ```

   `.dev.vars` is git-ignored. `ENVIRONMENT=local` switches off Access verification and uses `DEV_USER_EMAIL` as the signed-in user. Never use real addresses in files you commit.
3. Create the local database: `npm run db:migrate:local`
4. Start everything: `npm run dev`. The API runs on <http://localhost:8787> and the app on <http://localhost:4200> (which proxies `/api`).

| Command | What it does |
|---|---|
| `npm run dev` | `wrangler dev` and `ng serve` together |
| `npm run db:migrate:local` | Applies migrations to the local D1 database |
| `npm test` | Angular unit tests and Worker tests |
| `npm run build` | Production build of the app |
| `npm run e2e` | Playwright smoke tests (see below) |
| `npm run deploy` | Remote migrations, then `wrangler deploy` |

Workers AI has no local emulation. In `wrangler dev` the recipe feature calls the real service and uses the daily allowance.

### End-to-end tests

`npm run e2e` builds the app, starts `wrangler dev` on port 8787 against a fresh local database (`.wrangler/e2e`, wiped on every run), and drives it with Playwright in an iPhone 14 profile on Chromium. The tests never call the recipe feature. Stop `npm run dev` first: the e2e server needs port 8787 and never reuses a running server.

The first time, or after upgrading `@playwright/test`, install the matching browser:

```sh
npx playwright install chromium
```

E2E tests don't run in CI: they need a browser and wrangler, and CI should stay fast.

## One-time Cloudflare setup

Prerequisite: the `ki-tho.be` zone is already on Cloudflare. The app lives at `freeza.ki-tho.be`.

You need `wrangler` logged in (`npx wrangler login`) for steps 1 and 2.

### 1. Create the D1 database

```sh
npx wrangler d1 create freeza-db
```

Copy the `database_id` from the output into `wrangler.jsonc` under `d1_databases`. The id isn't a secret, so you can commit it. The committed `wrangler.jsonc` already holds the id of the live database; only replace it if you create a new one.

### 2. Create the Zero Trust organisation

In the Cloudflare dashboard, open **Zero Trust**. If you haven't used it before, it asks you to create an organisation. Pick a team name (for example `freeza`) and choose the free plan. Your team domain is then `<team-name>.cloudflareaccess.com`.

### 3. Enable one-time PIN

In Zero Trust go to **Settings > Authentication > Login methods**. Add **One-time PIN**. People then receive a code by email each time they sign in.

### 4. Create the Access application

1. Go to **Access > Applications > Add an application** and choose **Self-hosted**.
2. Application name: `Freeza`. Session duration: **1 month**, so phones rarely ask for a new code.
3. Public hostname: `freeza.ki-tho.be`.
4. Add a policy with action **Allow**. Under **Include**, choose **Emails** and add the two addresses that may use the app (`you@example.com` and `partner@example.com` are placeholders; use the real ones in the dashboard only).
5. Under login methods, allow One-time PIN only.
6. Save the application.

The Worker has `workers_dev` and preview URLs switched off, so `freeza.ki-tho.be` is the only way in.

### 5. Copy the team domain and AUD tag into `wrangler.jsonc`

- Team domain: `<team-name>.cloudflareaccess.com` (from step 2).
- AUD tag: open the Access application and copy the **Application Audience (AUD) Tag** from its overview.

Put both in `vars`:

```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "ACCESS_TEAM_DOMAIN": "<team-name>.cloudflareaccess.com",
  "ACCESS_AUD": "<aud-tag>"
}
```

Neither value is secret. Commit them. The committed `wrangler.jsonc` already holds the values for the live Access application.

### 6. Set the `ALLOWED_EMAILS` secret

The Worker double-checks the signed-in email against `ALLOWED_EMAILS`, a comma-separated list. It's personal data, so it stays out of the repo. Store it as a Worker secret with Wrangler, after the first deploy (step 8):

```sh
echo "you@example.com,partner@example.com" | npx wrangler secret put ALLOWED_EMAILS
```

Use the real addresses, separated by a comma, with no spaces. The secret takes effect at once and survives later deploys. Check it with `npx wrangler secret list`.

Until it's set, the Worker refuses every request with `403`.

### 7. Connect Workers Builds

Cloudflare builds and deploys the Worker from the repository.

1. In the dashboard open the `freeza` Worker, then **Settings > Build**, and connect the GitHub repository.
2. Set the build settings:
   - **Production branch:** `main`
   - **Build command:** `npx tsc -p worker/tsconfig.json && npm test && npm run build`
   - **Deploy command:** `npm run deploy`
   - **Root directory:** `/`
3. Switch off **Builds for non-production branches**. A branch build would upload a version that shares the production database.
4. Give the build's API token **Account > D1 > Edit**, so the deploy command can apply migrations. If a build reports another missing permission, add exactly that one and rebuild.

The Node version comes from `.node-version`. Angular 22 refuses older Node 22 releases, so keep that file.

### 8. Deploy

See [Deploying](#deploying). After the first deploy, do step 6, then check the protection:

- Open <https://freeza.ki-tho.be> in a private window. You must see the Cloudflare Access login (email code) before the app.
- <https://freeza.ki-tho.be/api/health> must not return JSON until you've signed in.

Then sign in with a one-time PIN.

## Deploying

Merge to `main`. Workers Builds type-checks the Worker, runs the tests, builds, applies D1 migrations to the remote database and deploys. A failing step stops the deploy. Follow builds in the dashboard under the Worker's **Deployments > Builds**.

Pull requests run the `CI` GitHub workflow (type-check, tests, build) and don't deploy. There are no preview deployments: a preview would share the production database.

Don't add a GitHub deploy workflow next to Workers Builds. Two deployers would race, and only one of them would apply migrations first.

To deploy by hand (after `npm run build`):

```sh
npm run deploy
```

That applies the remote migrations (`wrangler d1 migrations apply freeza-db --remote`) and then runs `wrangler deploy`.

## Known gaps

- The recipe limit text is unverified. The Worker maps a Workers AI "allowance exceeded" error to `429 ai_limit` by matching the error, and the exact error wording was never observed. Check that the app shows "Recipe ideas are resting for today" the first time a real Workers AI limit is hit.

## Decommissioning Firebase

The old version of Freeza ran on Firebase. No data is migrated; the new app starts empty. The `FIREBASE_SERVICE_ACCOUNT_FREEZA_INVENTORY` GitHub secret has been deleted. One step remains, by hand: delete the `freeza-inventory` project in the Firebase console.
