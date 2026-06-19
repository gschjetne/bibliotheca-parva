# Bibliotheca Parva

## Introduction

*Bibliotheca Parva* is a library management system designed for small private home libraries only.

Institutional users should probably consider one of the established systems instead.

## Stack

It runs on Cloudflare Workers (Hono, server-rendered HTML + HTMX) with a D1
database and FTS5 search, gated by Cloudflare Access. The application lives in
[`worker/`](worker/); see [`docs/`](docs/) for the architecture, data model, and
deploy runbook.

## License

Bibliotheca Parva is licensed under the [GNU Affero General Public License, version 3](COPYING).
