import { describe, it, expect } from "vitest";
import {
  classifyQuery,
  buildFtsMatch,
  formatContributors,
  formatLanguages,
} from "../src/search";

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
});

describe("formatLanguages", () => {
  it("joins stored JSON codes", () => {
    expect(formatLanguages('["eng","swe"]')).toBe("eng, swe");
  });
  it("handles null/garbage", () => {
    expect(formatLanguages(null)).toBe("");
    expect(formatLanguages("not json")).toBe("");
  });
});
