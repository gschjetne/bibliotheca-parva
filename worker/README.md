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
npm run bootstrap:local  # apply migration, import the dump, seed local D1
npm run dev              # wrangler dev (set ACCESS_BYPASS=true locally)
```

`bootstrap:local` runs three steps you can also run individually:
`migrate:local`, `import` (writes `seed.sql` from `../db-backup.sql.bz2`),
`seed:local`. `seed.sql` is git-ignored — it is derived from the (private) dump.

## Status

Bootstrap skeleton: schema, dump import, ISBN + folding utilities (unit-tested),
and an Access-gated Hono app that boots. Search / add-by-ISBN / edit routes and
the Cucumber acceptance-test wiring arrive during iteration.

## Not yet done (tracked for iteration)

- Full Access JWT verification (RS256 against the team JWKS + AUD) — currently
  decode-only with a `TODO`; `ACCESS_BYPASS=true` for local dev.
- Replace the placeholder `database_id` in `wrangler.jsonc` with the real id
  from `wrangler d1 create` before deploying (runbook, phase 4).
- FTS triggers to keep `book_fts` in sync on writes (the import populates it
  directly for now).
