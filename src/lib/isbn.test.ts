import { describe, it, expect } from "vitest";
import { isValidIsbn, toIsbn10, toIsbn13 } from "./isbn";

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

  it("handles an X check digit (both cases)", () => {
    // 097522980X is a valid ISBN-10 whose check digit is X.
    expect(isValidIsbn("097522980X")).toBe(true);
    expect(isValidIsbn("097522980x")).toBe(true); // clean() upper-cases
    // Converting its ISBN-13 back yields the X check digit (isbn10CheckDigit).
    expect(toIsbn10("9780975229804")).toBe("097522980X");
    expect(toIsbn13("097522980X")).toBe("9780975229804");
  });

  it("toIsbn10 returns an already-valid ISBN-10 unchanged, and null otherwise", () => {
    expect(toIsbn10("0261103571")).toBe("0261103571");
    // 978-prefixed but invalid ISBN-13 -> not convertible -> null (not "0000000000")
    expect(toIsbn10("9780000000000")).toBeNull();
  });

  it("validation is anchored to the whole string", () => {
    // valid 13-digit body with a trailing char must be rejected
    expect(isValidIsbn("9780261103573X")).toBe(false);
    // valid 10-digit body with a trailing char must be rejected
    expect(isValidIsbn("0261103571X")).toBe(false);
  });
});
