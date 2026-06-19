# Architecture — Bibliotheca Parva on Cloudflare

Status: accepted for the migration. Supersedes the Django + Postgres + container
deployment. This document records the decisions and their rationale so phases 3
(data model) and 4 (implementation) have a fixed target.

## Context and goals

Bibliotheca Parva is a private home-library catalogue: one household, ~1700
books, read-heavy, search-driven, login-gated. The Django app works but a
running container is wasteful for this usage. Goals:

- **Scale to zero** — no idle cost when nobody is using it.
- **Feature parity** with the behaviour captured in `features/*.feature`.
- **Simplicity** — small surface, few moving parts, free to run.

## Decisions

| Concern | Decision |
|---|---|
| Compute | Cloudflare **Workers** (functions), free plan |
| Web framework | **Hono**, server-rendered HTML + HTMX (no SPA) |
| Persistence | **D1** (SQLite) |
| Search | **FTS5** full-text index, accent-folded |
| Auth | **Self-hosted** username + password, tuned PBKDF2, signed-cookie session |
| Static assets | **Workers Static Assets** |
| ISBN metadata | **Parallel `fetch()` fan-out** → review screen → save |

### Compute: Workers (free plan)

Per-request billing, genuine scale-to-zero, negligible cold start. The free
plan's limits are all comfortable for this app **except** the ~10 ms CPU budget
per request — see Auth.

### Web framework: Hono, server-rendered

The app is forms plus a little HTMX, not a SPA. Hono runs on Web Standards and
returns HTML — either via the `hono/html` tagged-template helper (ideal for HTMX
partial responses) or its JSX renderer for full-page layouts. The current
live-search and the new field-by-field review screen are both server-rendered
fragment swaps, so the HTMX model ports over directly. Hono's router also
provides the auth-gate middleware. (A zero-dependency plain Worker with a
template function is the fallback if we want to drop the dependency.)

### Persistence: D1

D1 is real SQLite; our simplified relational model maps onto it directly. At
1700 books we sit far inside the **free tier** (5 M row-reads/day, 100 k
writes/day, 500 MB) and pay nothing. Writes go to a single primary; we do **not**
opt into the read-replica Sessions API, so reads are strongly consistent with
zero effort. Schema is managed with `wrangler d1 migrations` (versioned `.sql`
files tracked in a `d1_migrations` table); the production dump is imported the
same way for the parity-verification pass (phase 4).

### Search: FTS5, accent-folded

FTS5 is available on D1 and replaces the current `LIKE '%term%'` OR-chain across
title / subtitle / contributor names. Two D1 facts make FTS5 the right call
rather than a nicety:

- **`LIKE`/`GLOB` patterns are capped at 50 bytes** on D1 — fine for our 1700
  rows but a real limit to design around.
- **`COLLATE NOCASE` is ASCII-only.** The catalogue contains Nordic names
  (e.g. "Åke Ohlmarks") and Swedish/Norwegian source data, so case/accent-
  insensitive search needs folding. We store an accent-folded, lowercased copy
  of searchable text and index it with FTS5, kept in sync via triggers (or on
  write from the app).

### Auth: self-hosted password, tuned PBKDF2, signed-cookie session

Closest to the current Django behaviour and keeps everything in-app and free.
The constraint: the free plan's ~10 ms CPU limit (CPU, not wall-clock) cannot
fit OWASP-strength password hashing. Approach:

- **PBKDF2 via Web Crypto `SubtleCrypto`**, iteration count tuned to run
  comfortably under the free CPU budget (Web Crypto has no bcrypt/scrypt).
- **`crypto.subtle.timingSafeEqual`** for constant-time hash comparison.
- **Login rate-limiting** to offset the reduced iteration count.
- **Stateless signed session cookie** (HttpOnly, Secure, SameSite=Lax;
  HMAC-signed via Web Crypto — microseconds of CPU), so hashing happens only at
  login and every other request stays near-zero CPU.

Trade-off accepted for a single-household private app. Escape hatches if it ever
matters: Workers Paid ($5/mo → 30 s CPU → full-strength hashing), or front the
app with Cloudflare Access (no in-app auth code at all). Users live in a D1
table; passwords are never stored in plaintext.

### Static assets: Workers Static Assets

Replaces Django `staticfiles`. CSS and the vendored `htmx.min.js` ship from an
assets directory configured in `wrangler` config; asset requests are served at
the edge and do **not** count as Worker invocations. SPA `not_found_handling`
stays **off** so unmatched routes reach the Worker.

### ISBN metadata: parallel fan-out → review → save

Realises decision 3 from `features/README.md`. On ISBN lookup the Worker calls
all configured bibliographic providers **in parallel** (`Promise.all`), then
renders a review screen showing each provider's value per field. The librarian
picks per field (or types their own); the book is created only on save.

- 3+ parallel `fetch()` calls are trivially within the free limits (50 external
  subrequests/invocation, 6 concurrent header-waits).
- Network wait does **not** count against the 10 ms CPU budget; parallel time is
  bounded by the slowest provider, not the sum.
- Candidate data is **transient** — held in form/request state, never persisted
  until save. A slow or unavailable provider must not block the others.
- Adding a new provider is additive: another column of candidates, same UI.

## Key data flows

**Add by ISBN.** Home-page ISBN field (Return or "Add") → validate/canonicalise
ISBN → fan-out to providers in parallel → review screen (candidates per field) →
librarian composes → save creates the book (and its FTS index row).

**Search.** Live HTMX `GET` as the librarian types → query the FTS5 index →
return an HTML fragment of result rows. Empty query returns nothing (by
decision).

## Dev & deploy

- `wrangler.jsonc` holds bindings (`d1_databases`, `assets`), `compatibility_date`,
  `vars`, and cron triggers.
- `wrangler dev` runs the Worker locally on workerd with local D1 and assets.
- Secrets via `wrangler secret put` (prod) and `.dev.vars` locally (git-ignored).
- Deploy with `wrangler deploy`. Named environments for any staging split.
- Cron Triggers (`triggers.crons` + a `scheduled()` handler) are available if we
  later want periodic metadata refresh — noted for phase 5, not used at parity.

## Deferred to later phases

- **Phase 3** — the simplified D1 schema (collapsing the over-modelled
  Person/Location/Subject entities and 5 role M2Ms; the production dump shows
  Location was never used).
- **Phase 4** — implementation to parity, plus importing the dump and diffing
  old vs new behaviour over real data.

## References

- D1 limits / pricing / SQL: https://developers.cloudflare.com/d1/platform/limits/ ,
  https://developers.cloudflare.com/d1/sql-api/sql-statements/
- Workers limits (CPU, subrequests): https://developers.cloudflare.com/workers/platform/limits/
- Static assets: https://developers.cloudflare.com/workers/static-assets/
- Web Crypto / hashing: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- Hono on Workers: https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/
