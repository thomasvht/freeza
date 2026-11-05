# Freeza

Freeza is a freezer inventory app for two people. It's a phone-first PWA: add what goes into the freezer, see what to use first, take items out with one tap (with undo), and ask for three recipe ideas based on what's in there.

It runs entirely on Cloudflare:

- One Worker serves the Angular 21 build and a Hono API under `/api`.
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

`npm run e2e` builds the app, starts `wrangler dev` on port 8787 against a fresh local database (`.wrangler/e2e`, wiped on every run), and drives it with Playwright in an iPhone 14 profile on Chromium. The tests never call the recipe feature.

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

Copy the `database_id` from the output and replace the placeholder (`00000000-0000-0000-0000-000000000000`) in `wrangler.jsonc` under `d1_databases`. The id isn't a secret, so you can commit it.

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

Neither value is secret. Commit them.

### 6. Set `ALLOWED_EMAILS` in the dashboard

The Worker double-checks the signed-in email against `ALLOWED_EMAILS`, a comma-separated list. It's personal data, so it stays out of the repo.

`wrangler.jsonc` sets `"keep_vars": true`, so `wrangler deploy` keeps variables you set in the dashboard instead of deleting them. The Worker has to exist before you can set a variable, so do this after the first deploy (step 8):

1. In the dashboard open **Workers & Pages > freeza > Settings > Variables and Secrets**.
2. Add a plain-text variable `ALLOWED_EMAILS` with the two addresses separated by a comma, with no spaces.

Until it's set, the Worker refuses every request with `403`.

### 7. Create an API token and add the GitHub secrets

1. In the dashboard open **My Profile > API Tokens > Create Token > Create Custom Token**.
2. Permissions:
   - Account > Workers Scripts > Edit
   - Account > D1 > Edit
   - Account > Workers AI > Read (Edit if the deploy complains)
   - Zone > Workers Routes > Edit on `ki-tho.be`, which the custom domain route needs
   - Zone > DNS > Edit on `ki-tho.be`, which creating the custom domain's DNS record needs
3. Create the token and copy it. You only see it once.
4. In GitHub open the repository's **Settings > Secrets and variables > Actions** and add:
   - `CLOUDFLARE_API_TOKEN`: the token
   - `CLOUDFLARE_ACCOUNT_ID`: your account id (shown on the Workers & Pages overview)

### 8. Deploy

See [Deploying](#deploying). After the first deploy, do step 6, then open <https://freeza.ki-tho.be> and sign in with a one-time PIN.

## Deploying

Merge to `main`. The `Deploy` workflow type-checks the Worker, runs the tests, builds, applies D1 migrations to the remote database and deploys. Deploys never run at the same time.

Pull requests run `CI` (type-check, tests, build) and don't deploy. There are no preview deployments: a preview would share the production database.

To deploy by hand (after `npm run build`):

```sh
npm run deploy
```

That applies the remote migrations (`wrangler d1 migrations apply freeza-db --remote`) and then runs `wrangler deploy`.

## Known gaps

- The recipe limit text is unverified. The Worker maps a Workers AI "allowance exceeded" error to `429 ai_limit` by matching the error, and the exact error wording was never observed. Check that the app shows "Recipe ideas are resting for today" the first time a real Workers AI limit is hit.

## Decommissioning Firebase

The old version of Freeza ran on Firebase. No data is migrated; the new app starts empty. After you've checked that the new app works, do these by hand:

1. Delete the `freeza-inventory` project in the Firebase console.
2. Delete the `FIREBASE_SERVICE_ACCOUNT_FREEZA_INVENTORY` secret in the GitHub repository settings.
