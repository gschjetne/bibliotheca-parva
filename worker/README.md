# Bibliotheca Parva — Cloudflare Worker

The Cloudflare Workers rewrite (see `../docs/architecture.md` and
`../docs/data-model.md`). Coexists with the Django app during the migration.

## Stack

- **Hono** on Workers, server-rendered HTML + HTMX (no SPA)
- **D1** (SQLite) with an **FTS5** search index
- **Cloudflare Access** for auth (the Worker validates the Access JWT)
- **Workers Static Assets** from `public/`

## Layout

```
src/            Worker code (Hono app, pure utils: isbn.ts, fold.ts)
test/           Vitest unit tests
migrations/     D1 schema migrations (wrangler d1 migrations)
scripts/        import_dump.py — Postgres dump -> D1 seed SQL
public/         static assets (CSS, vendored htmx.min.js)
```

## Develop

```sh
npm install
npm test                 # unit tests (Vitest)
npm run test:acceptance  # Cucumber .feature files against the real app + D1
npm run test:all         # unit + acceptance
npm run bootstrap:local  # apply migration, import the dump, seed local D1
npm run dev              # wrangler dev (set ACCESS_BYPASS=true locally)
```

`test:acceptance` runs the `../features/*.feature` files via step definitions in
`acceptance/` that drive the real Hono app against a real local D1
(`getPlatformProxy`), reset per scenario. Provider HTTP is stubbed, so it needs
no network.

`bootstrap:local` runs three steps you can also run individually:
`migrate:local`, `import` (writes `seed.sql` from `../db-backup.sql.bz2`),
`seed:local`. `seed.sql` is git-ignored — it is derived from the (private) dump.

## Status

Feature-complete for parity: live search (FTS + ISBN), add-by-ISBN (multi-source
field picker), manual add, edit, and delete — all against D1, with the FTS index
kept in sync on every write. Auth is full Cloudflare Access JWT verification
(RS256 against the team JWKS + issuer/audience/expiry), fail-closed, with
`ACCESS_BYPASS=true` for local dev. Verified by 54 unit tests and 46 Cucumber
acceptance scenarios (2 `@pending`: the friendly language picker).

Remaining before deploy:

- Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`, and replace the placeholder
  `database_id` in `wrangler.jsonc` with the real id from `wrangler d1 create`
  (see the runbook, phase 4).
