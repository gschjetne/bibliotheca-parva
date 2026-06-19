import { describe, it, expect } from "vitest";
import { fold } from "../src/fold";

describe("fold", () => {
  it("lowercases", () => {
    expect(fold("CRIME")).toBe("crime");
  });

  it("strips Latin diacritics", () => {
    expect(fold("Åke Ohlmarks")).toBe("ake ohlmarks");
    expect(fold("Dostoïevski")).toBe("dostoievski");
  });

  it("collapses and trims whitespace", () => {
    expect(fold("  The   Two   Towers ")).toBe("the two towers");
  });

  it("lowercases non-Latin scripts without transliterating", () => {
    // Cyrillic stays Cyrillic — cross-script matching is via name_forms.
    expect(fold("ДОСТОЕВСКИЙ")).toContain("достоевск");
  });
});
