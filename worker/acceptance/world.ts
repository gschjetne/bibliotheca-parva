// Cucumber World: drives the real Hono app against a real local D1 (via
// getPlatformProxy), reset per scenario so each is hermetic. Provider fetches
// default to 404 (no network); scenarios can register provider responses.
import { getPlatformProxy } from "wrangler";
import { readFileSync, rmSync } from "node:fs";
import {
  setWorldConstructor,
  World,
  BeforeAll,
  AfterAll,
  Before,
} from "@cucumber/cucumber";
import app from "../src/index";
import { createBook, updateBook, deleteBook, getBookForEdit } from "../src/mutate";
import type { BookInput } from "../src/review";

type Proxy = Awaited<ReturnType<typeof getPlatformProxy>>;
let proxy: Proxy;

const realFetch = globalThis.fetch.bind(globalThis);
const PROVIDER_HOSTS = ["openlibrary.org", "bibliografisk.bs.no", "libris.kb.se"];

export type ProviderRoute = {
  host: string;
  handler: (url: string) => Response | Promise<Response>;
};
let providerRoutes: ProviderRoute[] = [];
let providerCalls = 0;
export function setProviderRoutes(routes: ProviderRoute[]) {
  providerRoutes = routes;
}
export function providerCallCount() {
  return providerCalls;
}

// Intercept the worker's outbound provider calls; pass everything else through
// (so the D1 proxy's own traffic is untouched).
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input.url;
  if (PROVIDER_HOSTS.some((h) => url.includes(h))) providerCalls++;
  for (const r of providerRoutes) if (url.includes(r.host)) return r.handler(url);
  if (PROVIDER_HOSTS.some((h) => url.includes(h))) return new Response("", { status: 404 });
  return realFetch(input, init);
}) as typeof fetch;

BeforeAll(async () => {
  rmSync(".wrangler/acceptance", { recursive: true, force: true });
  proxy = await getPlatformProxy({
    configPath: "wrangler.jsonc",
    persist: { path: ".wrangler/acceptance" },
  });
  // Strip line comments first (one contains a ';'), then split into statements.
  const sql = readFileSync("migrations/0001_init.sql", "utf8").replace(/--[^\n]*/g, "");
  for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
    await proxy.env.bibliotheca_parva.prepare(stmt).run();
  }
});

AfterAll(async () => {
  await proxy?.dispose();
});

const TABLES = ["contribution", "book_subject", "name_form", "book_fts", "book", "subject", "person"];

function emptyInput(over: Partial<BookInput>): BookInput {
  return {
    title: null, subtitle: null, original_title: null, edition_name: null,
    description: null, isbn: null, published_by: null, published_place: null,
    published_year: null, languages: [], shelf_location: null,
    contributors: [], subjects: [], ...over,
  };
}

export class BiblioWorld extends World {
  status = 0;
  body = "";
  location: string | null = null;
  bypass = "true";
  token: string | null = null;
  bookId = 0;
  bookTitle: string | null = null;
  expected: Record<string, string> = {};
  // add-by-ISBN flow state
  sources: Record<string, Record<string, string | string[]>> = {};
  lookupIsbn = "";
  form: Record<string, string> = {};

  get db() {
    return proxy.env.bibliotheca_parva as D1Database;
  }

  async resetDb() {
    for (const t of TABLES) await proxy.env.bibliotheca_parva.prepare(`DELETE FROM ${t}`).run();
  }

  async makeBook(over: Partial<BookInput>): Promise<number> {
    this.bookId = await createBook(proxy.env.bibliotheca_parva, emptyInput(over));
    this.bookTitle = over.title ?? null;
    return this.bookId;
  }

  async findBookId(title: string): Promise<number> {
    const r = await proxy.env.bibliotheca_parva.prepare("SELECT id FROM book WHERE title = ?").bind(title).first<{ id: number }>();
    return r?.id ?? 0;
  }

  async loadDraft(id: number): Promise<BookInput> {
    const b = await getBookForEdit(proxy.env.bibliotheca_parva, id);
    if (!b) throw new Error(`no book ${id}`);
    return emptyInput({
      title: b.title, subtitle: b.subtitle, original_title: b.original_title,
      edition_name: b.edition_name, description: b.description,
      isbn: b.isbn_13 ?? b.isbn_10, published_by: b.published_by,
      published_place: b.published_place, published_year: b.published_year,
      languages: b.languages ? JSON.parse(b.languages) : [],
      shelf_location: b.shelf_location,
      contributors: b.contributors.map((c) => ({ name: c.name_as_printed, role: c.role })),
      subjects: b.subjects,
    });
  }

  async editBook(id: number, fn: (d: BookInput) => void) {
    const d = await this.loadDraft(id);
    fn(d);
    await updateBook(proxy.env.bibliotheca_parva, id, d);
  }

  async removeBook(id: number) {
    await deleteBook(proxy.env.bibliotheca_parva, id);
  }

  async contributions(id: number) {
    const r = await proxy.env.bibliotheca_parva
      .prepare("SELECT name_as_printed, role FROM contribution WHERE book_id = ?")
      .bind(id)
      .all<{ name_as_printed: string; role: string }>();
    return r.results;
  }

  async req(method: string, path: string, form?: Record<string, string>) {
    const headers = new Headers();
    const init: RequestInit = { method, headers };
    if (form) {
      headers.set("content-type", "application/x-www-form-urlencoded");
      init.body = new URLSearchParams(form).toString();
    }
    if (this.token) headers.set("Cf-Access-Jwt-Assertion", this.token);
    const env = { ...proxy.env, ACCESS_BYPASS: this.bypass };
    const res = await app.fetch(new Request("http://t" + path, init), env as any, proxy.ctx as any);
    this.status = res.status;
    this.location = res.headers.get("location");
    this.body = await res.text();
    return res;
  }

  rowContaining(text: string): string | null {
    for (const chunk of this.body.split("<tr")) if (chunk.includes(text)) return chunk;
    return null;
  }
}

setWorldConstructor(BiblioWorld);

Before(async function (this: BiblioWorld) {
  providerRoutes = [];
  providerCalls = 0;
  this.bypass = "true";
  this.token = null;
  this.bookId = 0;
  this.bookTitle = null;
  this.expected = {};
  this.sources = {};
  this.lookupIsbn = "";
  this.form = {};
  await this.resetDb();
});
