import { describe, it, expect } from "vitest";
import { isValidIsbn, toIsbn10, toIsbn13 } from "../src/isbn";

// Pins features/isbn_handling.feature.

describe("isbn validity", () => {
  it.each([
    "9780261103573",
    "978-0-261-10357-3",
    "0261103571",
    "0-261-10357-1",
  ])("accepts valid ISBN %s in any form", (v) => {
    expect(isValidIsbn(v)).toBe(true);
  });

  it.each([
    "1234567890", // bad ISBN-10 check digit
    "9780261103579", // bad ISBN-13 check digit
    "not-an-isbn",
    "",
  ])("rejects invalid ISBN %s", (v) => {
    expect(isValidIsbn(v)).toBe(false);
  });
});

describe("isbn canonicalisation and conversion", () => {
  it("canonicalises to dash-free ISBN-13", () => {
    expect(toIsbn13("978-0-261-10357-3")).toBe("9780261103573");
  });

  it("derives ISBN-13 from an ISBN-10 (and back)", () => {
    expect(toIsbn13("0261103571")).toBe("9780261103573");
    expect(toIsbn10("9780261103573")).toBe("0261103571");
  });

  it("derives both forms for The Two Towers", () => {
    expect(toIsbn13("0261102362")).toBe("9780261102361");
    expect(toIsbn10("978-0-261-10236-1")).toBe("0261102362");
  });

  it("has no ISBN-10 for a 979-prefixed ISBN-13", () => {
    // 9791234567896 is a structurally valid 979 ISBN-13 with no ISBN-10.
    expect(toIsbn10("9791234567896")).toBeNull();
    expect(toIsbn13("9791234567896")).toBe("9791234567896");
  });

  it("returns null for invalid input", () => {
    expect(toIsbn13("1234567890")).toBeNull();
    expect(toIsbn10("nope")).toBeNull();
  });
});
