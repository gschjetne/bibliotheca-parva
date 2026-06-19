import { Given, When, Then, DataTable } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { BiblioWorld } from "../world";
import type { ContributorInput } from "../../src/review";

const ROLE_OF: Record<string, string> = {
  authors: "author",
  editors: "editor",
  illustrators: "illustrator",
  translators: "translator",
  foreword: "foreword",
};

function contributorsFromHash(h: Record<string, string>): ContributorInput[] {
  const out: ContributorInput[] = [];
  for (const [field, role] of Object.entries(ROLE_OF)) {
    if (!h[field]) continue;
    for (const name of h[field].split(/\s*,\s*/).filter(Boolean)) out.push({ name, role });
  }
  return out;
}

Given("I am signed in as {string}", function (this: BiblioWorld, _name: string) {
  this.bypass = "true";
});

Given("the catalogue contains:", async function (this: BiblioWorld, table: DataTable) {
  for (const row of table.hashes()) {
    await this.makeBook({
      title: row.title || null,
      subtitle: row.subtitle || null,
      isbn: row.isbn_13 || null,
      contributors: row.authors
        ? row.authors.split(/\s*,\s*/).map((name) => ({ name, role: "author" }))
        : [],
    });
  }
});

Given("a book {string} with:", async function (this: BiblioWorld, title: string, table: DataTable) {
  await this.makeBook({ title, contributors: contributorsFromHash(table.rowsHash()) });
});

Given(
  "the catalogue contains {int} books whose titles contain {string}",
  async function (this: BiblioWorld, n: number, word: string) {
    for (let i = 1; i <= n; i++) await this.makeBook({ title: `${word} volume ${i}` });
  },
);

When("I search for {string}", async function (this: BiblioWorld, query: string) {
  await this.req("GET", `/search?query=${encodeURIComponent(query)}`);
});

Then("the results include {string}", function (this: BiblioWorld, title: string) {
  assert.ok(this.body.includes(title), `expected results to include "${title}"`);
});

Then("the results do not include {string}", function (this: BiblioWorld, title: string) {
  assert.ok(!this.body.includes(title), `expected results NOT to include "${title}"`);
});

Then("no results are shown", function (this: BiblioWorld) {
  assert.ok(!this.body.includes("<strong>"), "expected no result rows");
});

Then("{string} appears exactly once in the results", function (this: BiblioWorld, title: string) {
  const count = this.body.split(title).length - 1;
  assert.equal(count, 1, `expected "${title}" exactly once, saw ${count}`);
});

Then("at most {int} results are shown", function (this: BiblioWorld, n: number) {
  const rows = this.body.split("<tr").length - 2; // minus head row + leading split
  assert.ok(rows <= n, `expected <= ${n} rows, saw ${rows}`);
});

Then("the results are ordered by title", function (this: BiblioWorld) {
  const titles = [...this.body.matchAll(/<strong>([^<]*)<\/strong>/g)].map((m) => m[1]);
  const sorted = [...titles].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(titles, sorted, "results not ordered by title");
});

Then(
  "the result for {string} shows the contributors {string}",
  function (this: BiblioWorld, title: string, contributors: string) {
    const row = this.rowContaining(title);
    assert.ok(row, `no result row for "${title}"`);
    assert.ok(row!.includes(contributors), `row for "${title}" missing contributors "${contributors}"`);
  },
);

Then(
  "the result for {string} links to that book's edit page",
  function (this: BiblioWorld, title: string) {
    const row = this.rowContaining(title);
    assert.ok(row && /\/books\/\d+\/edit/.test(row), `no edit link in row for "${title}"`);
  },
);
