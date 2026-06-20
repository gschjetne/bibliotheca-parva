# Architecture — Bibliotheca Parva on Cloudflare

Status: **as built.** This describes the SvelteKit-on-Workers app that is
deployed and live at `library.schjetne.dev`. It replaced the original Django +
Postgres + container deployment (and a short-lived interim Hono + HTMX cut on
Workers). The decisions below record what shipped and why.

## Context and goals

Bibliotheca Parva is a private home-library catalogue: one household, ~1700
books, read-heavy, search-driven, login-gated. The Django app worked but a
running container is wasteful for this usage. Goals:

- **Scale to zero** — no idle cost when nobody is using it.
- **Feature parity** with the behaviour captured in `features/*.feature`.
- **Simplicity** — small surface, few moving parts, free to run.

## Decisions

| Concern       | Decision                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------- |
| Compute       | Cloudflare **Workers** (functions), free plan                                            |
| Web framework | **SvelteKit** (Svelte 5) via `@sveltejs/adapter-cloudflare`                              |
| UI            | Client-rendered Svelte; JSON endpoints (`+server.ts`) for data                           |
| Styling       | **Tailwind CSS v4** (`@tailwindcss/vite`)                                                |
| Persistence   | **D1** (SQLite)                                                                          |
| Search        | **FTS5** full-text index, accent-folded                                                  |
| Auth          | **Cloudflare Access** (Zero Trust) in front of the Worker                                |
| Static assets | **adapter-cloudflare** output served as Workers assets                                   |
| ISBN metadata | **Client-side `fetch()` fan-out** → review screen → save                                 |
| Infra / IaC   | **Wrangler config + migrations in git**; one-time Access/DNS in a runbook (no Terraform) |

### Compute: Workers (free plan)

Per-request billing, genuine scale-to-zero, negligible cold start. The free
plan's limits are all comfortable for this app. The one limit that needed care —
the ~10 ms CPU budget per request — is a non-issue: auth (the only CPU-heavy
step) lives in Cloudflare Access, and the bibliographic fan-out runs in the
browser, not the Worker (see below).

### Web framework: SvelteKit on Workers

The app is a small client-rendered Svelte 5 app served by a single Worker.
`@sveltejs/adapter-cloudflare` compiles the SvelteKit app into a Worker entry
(`.svelte-kit/cloudflare/_worker.js`) plus a directory of client assets, both
declared in `wrangler.jsonc`. SvelteKit's file-based routing gives us the page
routes and the JSON API in one project, and `hooks.server.ts` is the natural
home for the Access gate (it runs before every request).

The UI is interactive (live search, a field-by-field review/edit table with
autocomplete chips), so it is rendered on the client and talks to small JSON
endpoints rather than swapping server-rendered HTML fragments. Pages do minimal
server work: only the edit page has a server `load` (to fetch the book); the rest
fetch from the JSON API as the user types.

#### Code structure

- `src/routes/+page.svelte` — home: live search + add-by-ISBN field.
- `src/routes/add/+page.svelte` — the add/review screen (renders `BookEditor`).
- `src/routes/books/[id]/edit/` — `+page.server.ts` loads the book; `+page.svelte`
  renders `BookEditor` for edit/delete.
- `src/routes/api/` — JSON endpoints: `search`, `books` (POST create),
  `books/[id]` (PUT/DELETE), and `suggest/{contributors,places,publishers}`.
- `src/lib/components/` — `BookEditor`, `ContributorPicker`, `LanguagePicker`,
  `SuggestInput`.
- `src/lib/server/` — D1-touching code: `db.ts` (search/suggest queries),
  `mutate.ts` (create/update/delete + FTS upkeep), `access.ts` (JWT verify).
- `src/lib/*.ts` — **isomorphic** pure logic shared by client and server and
  unit-tested in isolation: `isbn`, `fold`, `search`, `review`, `providers`,
  `sources`, `languages`. Keeping these I/O-free is what lets the provider
  parsers run unchanged in the browser.

### Persistence: D1

D1 is real SQLite; our simplified relational model (see `docs/data-model.md`)
maps onto it directly. At 1700 books we sit far inside the **free tier** (5 M
row-reads/day, 100 k writes/day, 500 MB) and pay nothing. Writes go to a single
primary; we do **not** opt into the read-replica Sessions API, so reads are
strongly consistent with zero effort. Schema is managed with `wrangler d1
migrations` (versioned `.sql` files in `migrations/`, tracked in a
`d1_migrations` table); the production catalogue was imported the same way.

### Search: FTS5, accent-folded

FTS5 on D1 replaces Django's `LIKE '%term%'` OR-chain across title / subtitle /
contributor names. Two D1 facts make FTS5 the right call rather than a nicety:

- **`LIKE`/`GLOB` patterns are capped at 50 bytes** on D1 — fine for our 1700
  rows but a real limit to design around.
- **`COLLATE NOCASE` is ASCII-only.** The catalogue contains Nordic names
  (e.g. "Åke Ohlmarks") and Swedish/Norwegian source data, so case/accent-
  insensitive search needs folding.

A `book_fts` virtual table indexes accent-folded, lowercased title / subtitle /
original-title / contributor-names / subjects. It is kept in sync **from the app
on every write** (`mutate.ts` deletes and re-inserts the row), not via SQL
triggers — the write path already owns the related person/contribution/subject
rows, so it is the simplest single place to also rebuild the FTS row. Queries
fold the user's terms and run prefix `MATCH`; a purely numeric query is routed to
an ISBN prefix match instead (`search.ts`).

### Auth: Cloudflare Access (Zero Trust)

The whole app is registered as a self-hosted Access application and gated at the
edge by identity (email OTP, Google, etc.). Requests are authenticated **before**
they reach the Worker, so the app holds no passwords, no session store, and no
login screen — and the free-plan CPU limit is never tested by hashing. The
household's authorised identities are an Access allow-list policy; adding or
removing a person is a policy change, not a schema change. Free for up to 50
seats, which a single household never approaches.

As defence in depth, `hooks.server.ts` still **verifies the Access JWT**
(`Cf-Access-Jwt-Assertion`) on every request: `access.ts` checks the RS256
signature against the team's JWKS (`/cdn-cgi/access/certs`, cached per isolate)
plus issuer, audience and expiry, and returns the identity onto
`event.locals.identity`. Anything reaching the Worker without a valid token —
e.g. a direct hit on the `*.workers.dev` URL, bypassing the protected
hostname — gets a 403. Local dev sets `ACCESS_BYPASS=true` in `.dev.vars` to open
the gate with a stub identity. See `features/authentication.feature`.

Consequences: **no `users` table and no auth code to maintain** beyond the ~115
lines of JWT verification — a net reduction in moving parts.

### Static assets: adapter-cloudflare

There is no separate static pipeline. `adapter-cloudflare` emits client JS, CSS
(Tailwind v4, built by `@tailwindcss/vite`) and `static/` files into
`.svelte-kit/cloudflare`, declared as the `assets` directory in `wrangler.jsonc`.
Asset requests are served at the edge and do **not** count as Worker
invocations; unmatched routes fall through to the SvelteKit Worker.

### ISBN metadata: client-side fan-out → review → save

Realises decision 3 from `features/README.md`, with one notable shift from the
original design: the fan-out runs **in the browser**, not the Worker.

On lookup, `sources.ts` fires a request to each configured provider — **Libris**
(`libris.kb.se`), **Open Library** (`openlibrary.org`) and **Bibbi**
(`bibliografisk.bs.no`) — independently (not awaited together), so the editor's
source columns fill in progressively and a slow or unavailable provider never
blocks the others. All three serve permissive CORS, so the parsers in
`providers.ts` run unchanged client-side. The review table shows each provider's
value per field; the librarian clicks to copy a value into their record (or types
their own), and the book is created only on **save** (`POST /api/books`).

Why client-side: it keeps third-party network latency and subrequests entirely
off the Worker (no CPU/subrequest budget spent, nothing to time out), the
candidate data is transient and never needs to touch our server until save, and
adding a provider is additive — another entry in `SOURCES`, another column.

## Key data flows

**Add by ISBN.** Home-page ISBN field (Return or "Add") → validate/canonicalise
the ISBN client-side (`isbn.ts`) → `/add?isbn=…` → the browser fans out to the
providers → review table (candidates per field) → librarian composes →
`POST /api/books` creates the book and its FTS row → redirect to its edit page.

**Search.** Debounced `GET /api/search?query=…` as the librarian types → folded
FTS5 (or ISBN-prefix) query in D1 → JSON rows → rendered by Svelte. Empty query
returns nothing (by decision).

**Edit / delete.** `/books/[id]/edit` server-loads the record → the same
`BookEditor` table → `PUT`/`DELETE /api/books/[id]`; updates rewrite
contributors, subjects and the FTS row and prune newly-orphaned persons.

## Dev & deploy

- `wrangler.jsonc` holds the `main` Worker entry, the `assets` binding, the
  `d1_databases` binding (`DB`), `compatibility_date`, the `nodejs_als` flag
  (AsyncLocalStorage, required by adapter-cloudflare), and `vars` (the non-secret
  `ACCESS_*` config).
- `npm run dev` runs the vite dev server; `npm run preview` runs the built Worker
  under `wrangler dev` with local D1 + `.dev.vars`.
- `npm run check` = `wrangler types` + `svelte-check`. `npm test` = Vitest units +
  Playwright E2E (`e2e/`, run against the built Worker + a seeded local D1).
- `npm run deploy` = `vite build` then `wrangler deploy`. A custom domain is a
  `routes` entry in `wrangler.jsonc`; without it the app deploys to
  `*.workers.dev` (handy for a smoke test). See `docs/runbook.md`.
- Local D1 is seeded from the production dump via `npm run bootstrap:local`
  (`db-backup.sql.bz2` → `seed.sql` → `wrangler d1 execute --local`).

### Infrastructure as code

`wrangler.jsonc` plus the versioned `migrations/` are the source of truth, all in
git — that covers ~80% of the infrastructure declaratively. The two pieces
wrangler does not manage — the **Cloudflare Access application + allow-list
policy** and **DNS / custom domain** — are one-time setup steps captured in
`docs/runbook.md` rather than codified in Terraform. Terraform was considered and
rejected for now: it would add a second toolchain, a state backend, and provider
churn for little benefit at single-household scale. If edge-config
reproducibility ever matters, the intended path is a small Terraform module
covering **only** Access + DNS, never the Worker/D1 (which wrangler manages
better).

## Possible future work

- **Cron Triggers** (`triggers.crons` + a `scheduled()` handler) are available if
  we later want periodic metadata refresh — not used today.
- **In-app passwords** as an escape hatch if we ever drop Access: self-hosted
  PBKDF2 via Web Crypto with iterations tuned to the free CPU budget (or Workers
  Paid for full-strength hashing).
- **Identity clustering/merge** for look-alike contributor records (the data
  model links contributions to a `person`, but merge is manual today).

## References

- D1 limits / pricing / SQL: https://developers.cloudflare.com/d1/platform/limits/ ,
  https://developers.cloudflare.com/d1/sql-api/sql-statements/
- Workers limits (CPU, subrequests): https://developers.cloudflare.com/workers/platform/limits/
- SvelteKit on Cloudflare: https://svelte.dev/docs/kit/adapter-cloudflare
- Workers static assets: https://developers.cloudflare.com/workers/static-assets/
- Web Crypto: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- Cloudflare Access (self-hosted app + JWT validation): https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
