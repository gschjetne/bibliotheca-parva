import { describe, it, expect } from "vitest";
import {
  reorderName,
  parseRefworks,
  openLibrary,
  bibbi,
  gatherCandidates,
  type Provider,
} from "../src/providers";

const ISBN = "9780261103573";

/** A mock fetch routing by URL substring to canned Responses. */
function mockFetch(routes: Record<string, { status?: number; body: string }>) {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    for (const [needle, r] of Object.entries(routes)) {
      if (u.includes(needle)) {
        return new Response(r.body, { status: r.status ?? 200 });
      }
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
}

describe("reorderName", () => {
  it("flips 'Last, First' to 'First Last'", () => {
    expect(reorderName("Tolkien, J. R. R.")).toBe("J. R. R. Tolkien");
    expect(reorderName("Murakami")).toBe("Murakami");
  });
});

describe("Open Library provider", () => {
  it("parses a record and resolves author names via sub-fetch", async () => {
    const f = mockFetch({
      [`/isbn/${ISBN}.json`]: {
        body: JSON.stringify({
          title: "The Fellowship of the Ring",
          publishers: ["Allen & Unwin"],
          publish_date: "1 August 2004",
          authors: [{ key: "/authors/OL26320A" }],
          description: { value: "Volume one." },
        }),
      },
      "/authors/OL26320A.json": {
        body: JSON.stringify({ name: "J. R. R. Tolkien" }),
      },
    });
    const c = await openLibrary.fetch(ISBN, f);
    expect(c).toMatchObject({
      source: "Open Library",
      title: "The Fellowship of the Ring",
      published_by: "Allen & Unwin",
      published_year: 2004,
      authors: ["J. R. R. Tolkien"],
      description: "Volume one.",
    });
  });

  it("returns null when the ISBN is unknown (404)", async () => {
    expect(await openLibrary.fetch(ISBN, mockFetch({}))).toBeNull();
  });
});

describe("Bibbi provider", () => {
  it("parses creators, publication subjects and year", async () => {
    const f = mockFetch({
      "bibliografisk.bs.no": {
        body: JSON.stringify({
          total: 1,
          works: [
            {
              name: "Norwegian Wood",
              creator: [{ name: "Murakami, Haruki" }],
              publications: [
                {
                  isbn: ISBN,
                  description: "A novel.",
                  about: [{ name: { nob: "Kjærlighet" } }],
                  genre: [{ name: { nob: "Roman" } }],
                  datePublished: "1987",
                },
              ],
            },
          ],
        }),
      },
    });
    const c = await bibbi.fetch(ISBN, f);
    expect(c).toMatchObject({
      source: "Bibbi",
      title: "Norwegian Wood",
      authors: ["Haruki Murakami"],
      description: "A novel.",
      subjects: ["Kjærlighet", "Roman"],
      published_year: 1987,
    });
  });

  it("returns null unless exactly one work matches", async () => {
    const f = mockFetch({
      "bibliografisk.bs.no": { body: JSON.stringify({ total: 0, works: [] }) },
    });
    expect(await bibbi.fetch(ISBN, f)).toBeNull();
  });
});

describe("Libris refworks parser", () => {
  it("parses fields and reorders contributor names when the ISBN matches", () => {
    const block = [
      "T1 The Fellowship of the Ring",
      "T2 being the first part",
      "A1 Tolkien, J. R. R.",
      "A2 Anderson, Douglas A.",
      "PB Allen & Unwin",
      "PP London",
      "YR 1954",
      "K1 Fantasy",
      `SN ${ISBN}`,
    ].join("\r\n");
    const c = parseRefworks(block, ISBN);
    expect(c).toMatchObject({
      source: "Libris",
      title: "The Fellowship of the Ring",
      subtitle: "being the first part",
      authors: ["J. R. R. Tolkien"],
      editors: ["Douglas A. Anderson"],
      published_by: "Allen & Unwin",
      published_place: "London",
      published_year: 1954,
      subjects: ["Fantasy"],
    });
  });

  it("returns null when no SN line matches the ISBN", () => {
    const block = ["T1 Some Other Book", "SN 9999999999999"].join("\r\n");
    expect(parseRefworks(block, ISBN)).toBeNull();
  });
});

describe("gatherCandidates fan-out", () => {
  const ok = (name: string): Provider => ({
    name,
    fetch: async () => ({ source: name, title: `${name} title` }),
  });
  const down = (name: string): Provider => ({
    name,
    fetch: async () => {
      throw new Error("unavailable");
    },
  });
  const empty = (name: string): Provider => ({ name, fetch: async () => null });

  it("collects results from healthy providers, preserving order", async () => {
    const got = await gatherCandidates(ISBN, mockFetch({}), [
      ok("Libris"),
      ok("Open Library"),
      ok("Bibbi"),
    ]);
    expect(got.map((c) => c.source)).toEqual(["Libris", "Open Library", "Bibbi"]);
  });

  it("a provider being unavailable does not block the others", async () => {
    const got = await gatherCandidates(ISBN, mockFetch({}), [
      down("Libris"),
      ok("Open Library"),
      empty("Bibbi"),
    ]);
    expect(got.map((c) => c.source)).toEqual(["Open Library"]);
  });
});
