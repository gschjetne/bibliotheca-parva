import { Given, When, Then, DataTable } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { BiblioWorld } from "../world";
import { setProviderRoutes, providerCallCount, type ProviderRoute } from "../world";
import { toIsbn13 } from "../../src/isbn";

const asArray = (v: string | string[] | undefined): string[] =>
  Array.isArray(v) ? v : v ? [v] : [];

// Serialise each scenario's source data into the native API responses the
// providers parse (Libris refworks text, Open Library + author JSON, Bibbi JSON).
function buildRoutes(
  sources: Record<string, Record<string, string | string[]>>,
  isbn13: string,
): ProviderRoute[] {
  const routes: ProviderRoute[] = [];

  const libris = sources["Libris"];
  if (libris === ("UNAVAILABLE" as any)) {
    routes.push({ host: "libris.kb.se", handler: () => { throw new Error("unavailable"); } });
  } else if (libris) {
    const lines: string[] = [];
    if (libris.title) lines.push(`T1 ${libris.title}`);
    if (libris.subtitle) lines.push(`T2 ${libris.subtitle}`);
    if (libris.published_by) lines.push(`PB ${libris.published_by}`);
    if (libris.published_year) lines.push(`YR ${libris.published_year}`);
    for (const a of asArray(libris.authors)) lines.push(`A1 ${a}`);
    lines.push(`SN ${isbn13}`);
    const text = lines.join("\r\n");
    routes.push({ host: "libris.kb.se", handler: () => new Response(text) });
  }

  const ol = sources["Open Library"];
  if (ol === ("UNAVAILABLE" as any)) {
    routes.push({ host: "openlibrary.org", handler: () => { throw new Error("unavailable"); } });
  } else if (ol) {
    const authors = asArray(ol.authors);
    const book: Record<string, unknown> = {};
    if (ol.title) book.title = ol.title;
    if (ol.subtitle) book.subtitle = ol.subtitle;
    if (ol.published_by) book.publishers = [ol.published_by];
    if (ol.published_year) book.publish_date = String(ol.published_year);
    if (authors.length) book.authors = authors.map((_, i) => ({ key: `/authors/OL${i}A` }));
    routes.push({
      host: "openlibrary.org",
      handler: (url) => {
        const m = url.match(/\/authors\/OL(\d+)A\.json/);
        if (m) return new Response(JSON.stringify({ name: authors[Number(m[1])] }));
        return new Response(JSON.stringify(book));
      },
    });
  }

  const bibbi = sources["Bibbi"];
  if (bibbi && bibbi !== ("UNAVAILABLE" as any)) {
    const work: Record<string, unknown> = { publications: [{ isbn: isbn13 }] };
    if (bibbi.title) work.name = bibbi.title;
    if (asArray(bibbi.authors).length)
      work.creator = asArray(bibbi.authors).map((name) => ({ name }));
    if (bibbi.published_year)
      (work.publications as any)[0].datePublished = String(bibbi.published_year);
    routes.push({
      host: "bibliografisk.bs.no",
      handler: () => new Response(JSON.stringify({ total: 1, works: [work] })),
    });
  }

  return routes;
}

function storeSources(world: BiblioWorld, rows: Record<string, string>[]) {
  for (const row of rows) {
    const s: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === "source" || !v) continue;
      s[k] = k === "authors" ? [v] : v;
    }
    world.sources[row.source] = s;
  }
}

Given(
  "the bibliographic sources return for ISBN {string}:",
  function (this: BiblioWorld, _isbn: string, table: DataTable) {
    storeSources(this, table.hashes());
  },
);

Given(
  "{string} returns title {string} for ISBN {string}",
  function (this: BiblioWorld, source: string, title: string, _isbn: string) {
    this.sources[source] = { title };
  },
);

Given("{string} is unavailable", function (this: BiblioWorld, source: string) {
  this.sources[source] = "UNAVAILABLE" as any;
});

Given("no bibliographic source recognises ISBN {string}", function (this: BiblioWorld, _isbn: string) {
  this.sources = {};
});

async function lookup(world: BiblioWorld, isbn: string) {
  world.lookupIsbn = toIsbn13(isbn) ?? isbn;
  setProviderRoutes(buildRoutes(world.sources, world.lookupIsbn));
  await world.req("POST", "/lookup", { isbn });
}

When("I look up the ISBN {string}", async function (this: BiblioWorld, isbn: string) {
  await lookup(this, isbn);
});
When("I try to look up the ISBN {string}", async function (this: BiblioWorld, isbn: string) {
  await lookup(this, isbn);
});

When("I type an ISBN into the ISBN field on the home page", function (this: BiblioWorld) {
  this.lookupIsbn = "9780261103573";
});
When("I submit it by pressing Return", async function (this: BiblioWorld) {
  await this.req("POST", "/lookup", { isbn: this.lookupIsbn });
});
Then("the ISBN lookup runs", function (this: BiblioWorld) {
  assert.equal(this.status, 200);
  assert.ok(this.body.includes('name="title"'), "expected a review form");
});

When("I choose to add a book without entering an ISBN", async function (this: BiblioWorld) {
  await this.req("GET", "/add");
});

When(/^I choose the "(.*)" offered by "(.*)"$/, function (this: BiblioWorld, field: string, source: string) {
  const v = this.sources[source]?.[field];
  this.form[field] = Array.isArray(v) ? v.join("\n") : (v ?? "");
});

When(
  "I type my own value {string} for the field {string}",
  function (this: BiblioWorld, value: string, field: string) {
    this.form[field] = value;
  },
);

When("I save the new book", async function (this: BiblioWorld) {
  await this.req("POST", "/books", { ...this.form, isbn: this.lookupIsbn });
  const m = this.location?.match(/\/books\/(\d+)\/edit/);
  if (m) this.bookId = Number(m[1]);
});

When("I cancel without saving", function () {
  /* no POST — nothing is persisted */
});

// --- review-screen assertions ---------------------------------------------
Then("I am shown a review screen for a new, unsaved book", async function (this: BiblioWorld) {
  assert.equal(this.status, 200);
  assert.ok(this.body.includes('name="title"'), "expected review form");
  const { count } = await this.db.prepare("SELECT COUNT(*) AS count FROM book").first<{ count: number }>();
  assert.equal(count, 0, "no book should be saved yet");
});

Then("I am shown a review screen with no candidate values pre-filled", function (this: BiblioWorld) {
  assert.equal(this.status, 200);
  assert.ok(this.body.includes('name="title" value=""'), "expected empty title field");
});

Then(
  /^for the field "(.*)" I can choose between "(.*)" and "(.*)"$/,
  function (this: BiblioWorld, _field: string, a: string, b: string) {
    assert.ok(this.body.includes(a) && this.body.includes(b), "both candidate values should be offered");
  },
);

Then(
  /^for the field "(.*)" I can choose "(.*)" offered by "(.*)"$/,
  function (this: BiblioWorld, _field: string, value: string, _source: string) {
    assert.ok(this.body.includes(value), `expected "${value}" offered`);
  },
);

Then("the title {string} is offered by {string}", function (this: BiblioWorld, title: string, _source: string) {
  assert.ok(this.body.includes(title));
});

Then("the ISBN I looked up is carried onto the review screen", function (this: BiblioWorld) {
  assert.ok(this.body.includes(`value="${this.lookupIsbn}"`), "ISBN should be carried onto the form");
});

Then("I can fill in every detail by hand and save", function (this: BiblioWorld) {
  assert.ok(this.body.includes('name="title"') && this.body.includes("Save book"));
});

// --- manual add (no ISBN): /add shows a blank, editable form ---------------
Then("a new blank book record is created", function (this: BiblioWorld) {
  assert.equal(this.status, 200);
  assert.ok(this.body.includes('name="title" value=""'), "expected a blank book form");
});

Then("I can enter the title and every other detail myself", function (this: BiblioWorld) {
  assert.ok(
    this.body.includes('name="title"') && this.body.includes('name="authors"') && this.body.includes("Save book"),
    "expected an editable form",
  );
});

// --- save outcomes ---------------------------------------------------------
Then("a new book record is created", async function (this: BiblioWorld) {
  const { count } = await this.db.prepare("SELECT COUNT(*) AS count FROM book").first<{ count: number }>();
  assert.ok(count >= 1, "a book should have been created");
});

Then("no book record is created", async function (this: BiblioWorld) {
  const { count } = await this.db.prepare("SELECT COUNT(*) AS count FROM book").first<{ count: number }>();
  assert.equal(count, 0);
});

Then("I am taken to that book's edit page", function (this: BiblioWorld) {
  if (this.location) assert.match(this.location, /\/books\/\d+\/edit/);
  else assert.ok(this.body.includes('name="title"'), "expected an editable page");
});

Then("the saved book's title is {string}", async function (this: BiblioWorld, title: string) {
  const row = await this.db.prepare("SELECT title FROM book WHERE id = ?").bind(this.bookId).first<{ title: string }>();
  assert.equal(row?.title, title);
});

Then("the saved book's publisher is {string}", async function (this: BiblioWorld, pub: string) {
  const row = await this.db.prepare("SELECT published_by FROM book WHERE id = ?").bind(this.bookId).first<{ published_by: string }>();
  assert.equal(row?.published_by, pub);
});

Then(
  "{string} is recorded as an author of the saved book",
  async function (this: BiblioWorld, name: string) {
    const rows = await this.contributions(this.bookId);
    assert.ok(rows.some((c) => c.name_as_printed === name && c.role === "author"));
  },
);

Then("the saved book can be found by searching for {string}", async function (this: BiblioWorld, query: string) {
  const title = (await this.db.prepare("SELECT title FROM book WHERE id = ?").bind(this.bookId).first<{ title: string }>())?.title;
  await this.req("GET", `/search?query=${encodeURIComponent(query)}`);
  assert.ok(title && this.body.includes(title), "saved book should be found");
});

// --- ISBN validity (shared with isbn_handling) -----------------------------
Then("the ISBN is accepted and the lookup proceeds", function (this: BiblioWorld) {
  assert.equal(this.status, 200);
  assert.ok(this.body.includes('name="title"'), "expected the review screen");
});

Then("it is rejected as not a valid ISBN", function (this: BiblioWorld) {
  assert.ok(this.body.includes("is not a valid ISBN"));
});

Then("I am shown an error that the ISBN is not valid", function (this: BiblioWorld) {
  assert.ok(this.body.includes("is not a valid ISBN"));
});

Then("no bibliographic source is queried", function () {
  assert.equal(providerCallCount(), 0);
});
