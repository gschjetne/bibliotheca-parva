import { describe, it, expect } from "vitest";
import {
  classifyQuery,
  buildFtsMatch,
  formatContributors,
  formatLanguages,
} from "./search";

describe("classifyQuery", () => {
  it("treats an empty/blank query as empty", () => {
    expect(classifyQuery("")).toEqual({ type: "empty" });
    expect(classifyQuery("   ")).toEqual({ type: "empty" });
  });

  it("routes long digit strings to ISBN-prefix search", () => {
    expect(classifyQuery("9780596805883")).toEqual({
      type: "isbn",
      prefix: "9780596805883",
    });
    expect(classifyQuery("978-0-261-10357-3")).toEqual({
      type: "isbn",
      prefix: "9780261103573",
    });
    expect(classifyQuery("0261103571")).toEqual({
      type: "isbn",
      prefix: "0261103571",
    });
  });

  it("routes words (and short numbers) to full-text search", () => {
    expect(classifyQuery("towers")).toEqual({ type: "text", match: '"towers"*' });
    expect(classifyQuery("1984")).toEqual({ type: "text", match: '"1984"*' });
  });

  it("recognises an ISBN-10 ending in X, case-insensitively", () => {
    expect(classifyQuery("030640615X")).toEqual({ type: "isbn", prefix: "030640615X" });
    expect(classifyQuery("030640615x")).toEqual({ type: "isbn", prefix: "030640615X" });
  });

  it("requires the WHOLE query to be ISBN-shaped (anchored), else text", () => {
    // leading non-digits -> not an ISBN (kills a `^`-removal mutant)
    expect(classifyQuery("ab12345678").type).toBe("text");
    // trailing junk -> not an ISBN (kills a `$`-removal mutant)
    expect(classifyQuery("12345678ab").type).toBe("text");
    expect(classifyQuery("030640615Xyz").type).toBe("text");
    expect(classifyQuery("yz030640615X").type).toBe("text");
  });

  it("a non-empty query with no usable tokens is empty", () => {
    expect(classifyQuery("...")).toEqual({ type: "empty" });
  });
});

describe("buildFtsMatch", () => {
  it("folds, tokenises, and makes each term a prefix", () => {
    expect(buildFtsMatch("Two Towers")).toBe('"two"* "towers"*');
  });
  it("folds accents", () => {
    expect(buildFtsMatch("Ohlmarks Åke")).toBe('"ohlmarks"* "ake"*');
  });
  it("drops punctuation-only input", () => {
    expect(buildFtsMatch("  ...  ")).toBe("");
  });
});

describe("formatContributors", () => {
  it("orders by role then position and annotates non-authors", () => {
    const cs = [
      { name_as_printed: "Åke Ohlmarks", role: "translator", position: 0 },
      { name_as_printed: "J. R. R. Tolkien", role: "author", position: 0 },
      { name_as_printed: "Alan Lee", role: "illustrator", position: 0 },
      { name_as_printed: "Douglas A. Anderson", role: "editor", position: 0 },
    ];
    expect(formatContributors(cs)).toBe(
      "J. R. R. Tolkien, Douglas A. Anderson (ed.), Alan Lee (ill.), Åke Ohlmarks (tr.)",
    );
  });

  it("omits forewords from the contributor line", () => {
    const cs = [
      { name_as_printed: "A. Author", role: "author", position: 0 },
      { name_as_printed: "F. Writer", role: "foreword", position: 0 },
    ];
    expect(formatContributors(cs)).toBe("A. Author");
  });

  it("keeps multiple authors in position order", () => {
    const cs = [
      { name_as_printed: "Second", role: "author", position: 1 },
      { name_as_printed: "First", role: "author", position: 0 },
    ];
    expect(formatContributors(cs)).toBe("First, Second");
  });

  it("does not mutate (reorder) the caller's array", () => {
    const cs = [
      { name_as_printed: "Second", role: "author", position: 1 },
      { name_as_printed: "First", role: "author", position: 0 },
    ];
    formatContributors(cs);
    // The input order is untouched (the function sorts a copy).
    expect(cs.map((c) => c.name_as_printed)).toEqual(["Second", "First"]);
  });
});

describe("formatLanguages", () => {
  it("joins stored JSON codes as display names", () => {
    expect(formatLanguages('["eng","swe"]')).toBe("English, Swedish");
  });
  it("handles null/garbage", () => {
    expect(formatLanguages(null)).toBe("");
    expect(formatLanguages("not json")).toBe("");
    expect(formatLanguages('{"not":"an array"}')).toBe(""); // valid JSON, non-array
  });
});
