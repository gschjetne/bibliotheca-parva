# Bibliotheca Parva

## Introduction

*Bibliotheca Parva* is a library management system designed for small private home libraries only.

Institutional users should probably consider one of the established systems instead.

## Stack

It runs on Cloudflare Workers — a [SvelteKit](https://svelte.dev/docs/kit) app
(Svelte 5) built with `@sveltejs/adapter-cloudflare` and Tailwind v4 — backed by
a D1 database with FTS5 search and gated by Cloudflare Access. The application
lives at the repository root (`src/`, `migrations/`, `wrangler.jsonc`); see
[`docs/`](docs/) for the architecture, data model, and deploy runbook.

## Develop

```sh
npm install
npm run bootstrap:local   # seed a local D1 from db-backup.sql.bz2 (optional)
npm run dev               # vite dev server
npm run check             # types + svelte-check
npm test                  # unit (vitest) + e2e (playwright)
npm run test:mutation     # Stryker mutation testing of src/lib (needs procps/ps)
npm run deploy            # build + wrangler deploy
```

## License

Bibliotheca Parva is licensed under the [GNU Affero General Public License, version 3](COPYING).
