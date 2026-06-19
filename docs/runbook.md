# Deploy runbook — Bibliotheca Parva on Cloudflare

One-time setup plus the deploy steps. Run everything from the repository root.

## Prerequisites

- A Cloudflare account.
- For Access (auth), a **domain (zone) on Cloudflare** is strongly recommended —
  Cloudflare Access protects hostnames in a zone you control. A `*.workers.dev`
  URL works for serving the app but is awkward to gate with Access; prefer a
  custom domain (e.g. `library.example.com`).

## 1. Authenticate

Interactive (run it yourself in the session):

```
! npx wrangler login
```

…or set a scoped API token (Workers Scripts:Edit, D1:Edit, Account:Read):

```
export CLOUDFLARE_API_TOKEN=…
```

Confirm with `npx wrangler whoami`.

## 2. Create the D1 database

```
npx wrangler d1 create bibliotheca-parva
```

Copy the printed `database_id` into `wrangler.jsonc` (replace the
`00000000-…` placeholder).

## 3. Create the schema on the remote D1

```
npx wrangler d1 migrations apply bibliotheca-parva --remote
```

## 4. (Optional) Load the existing catalogue

To migrate the ~1,700 books from the old app:

```
npm run import        # writes seed.sql from db-backup.sql.bz2
npx wrangler d1 execute bibliotheca-parva --remote --file=./seed.sql
```

Skip this for a fresh, empty catalogue. (`seed.sql` and the dump contain real
data — they stay out of git.)

## 5. Create the Cloudflare Access application

In the Zero Trust dashboard (one-time):

1. **Settings → Custom Pages / team domain**: note your team domain, e.g.
   `yourteam.cloudflareaccess.com`.
2. **Access → Applications → Add → Self-hosted**: set the application domain to
   the hostname you'll serve from (step 7), e.g. `library.example.com`.
3. Add a **policy** that allows your household (e.g. an email allow-list or a
   specific identity provider).
4. From the application's settings, copy its **Application Audience (AUD) tag**.

## 6. Wire the Access settings

Put your values in `wrangler.jsonc` `vars` (these are not secret):

```jsonc
"ACCESS_BYPASS": "false",
"ACCESS_TEAM_DOMAIN": "yourteam.cloudflareaccess.com",
"ACCESS_AUD": "<the AUD tag from step 5>"
```

The Worker verifies the Access JWT against these; with them blank it is
fail-closed (every request → 403), which is the safe default before Access is
configured.

## 7. Deploy

For a custom domain, add a route to `wrangler.jsonc` (and ensure the zone is on
Cloudflare):

```jsonc
"routes": [{ "pattern": "library.example.com", "custom_domain": true }]
```

Then:

```
npm run deploy      # builds the app, then wrangler deploy
```

(For a quick `*.workers.dev` smoke test instead, skip the route; the app deploys
to `bibliotheca-parva.<your-subdomain>.workers.dev`.)

## 8. Verify

- Visit the hostname → you should be sent to Cloudflare Access to sign in →
  after signing in, the catalogue loads.
- A direct request without a valid Access JWT must be refused:
  `curl -s -o /dev/null -w '%{http_code}' https://<hostname>/` → `403`.
- Search, add-by-ISBN, edit and delete should all work against the remote D1.

## Redeploying / changes

- Code or CSS change → `npm run deploy`.
- Schema change → add a migration, `wrangler d1 migrations apply … --remote`,
  then deploy.
- Access membership → edit the policy in the Zero Trust dashboard (no redeploy).
