import { describe, it, expect } from "vitest";
import { scalarOptions, listOptions, parseBookForm } from "../src/review";
import type { Candidate } from "../src/providers";

const CANDS: Candidate[] = [
  {
    source: "Libris",
    title: "The Fellowship of the Ring",
    authors: ["J. R. R. Tolkien"],
  },
  {
    source: "Open Library",
    title: "Fellowship of the Ring",
    published_by: "HarperCollins",
    authors: ["J.R.R. Tolkien"],
  },
];

describe("scalarOptions", () => {
  it("offers each source's distinct value", () => {
    expect(scalarOptions(CANDS, "title")).toEqual([
      { source: "Libris", value: "The Fellowship of the Ring" },
      { source: "Open Library", value: "Fellowship of the Ring" },
    ]);
  });
  it("skips missing values", () => {
    expect(scalarOptions(CANDS, "published_by")).toEqual([
      { source: "Open Library", value: "HarperCollins" },
    ]);
  });
});

describe("listOptions", () => {
  it("offers each source's list", () => {
    expect(listOptions(CANDS, "authors")).toEqual([
      { source: "Libris", names: ["J. R. R. Tolkien"] },
      { source: "Open Library", names: ["J.R.R. Tolkien"] },
    ]);
  });
});

describe("parseBookForm", () => {
  it("maps scalar fields, contributors by role, and lists", () => {
    const form: Record<string, string> = {
      title: "  The Fellowship of the Ring ",
      published_year: "2004",
      isbn: "978-0-261-10357-3",
      authors: "J. R. R. Tolkien\n",
      translators: "Åke Ohlmarks",
      foreword: "Christopher Tolkien",
      languages: "eng, swe",
      subjects: "Fantasy\nMiddle-earth",
    };
    const input = parseBookForm((k) => form[k]);
    expect(input.title).toBe("The Fellowship of the Ring");
    expect(input.published_year).toBe(2004);
    expect(input.isbn).toBe("978-0-261-10357-3");
    expect(input.languages).toEqual(["eng", "swe"]);
    expect(input.subjects).toEqual(["Fantasy", "Middle-earth"]);
    expect(input.contributors).toEqual([
      { name: "J. R. R. Tolkien", role: "author" },
      { name: "Åke Ohlmarks", role: "translator" },
      { name: "Christopher Tolkien", role: "foreword" },
    ]);
  });

  it("treats blank fields as null and a non-numeric year as null", () => {
    const input = parseBookForm((k) => ({ published_year: "n/a" })[k]);
    expect(input.title).toBeNull();
    expect(input.published_year).toBeNull();
    expect(input.contributors).toEqual([]);
  });
});
