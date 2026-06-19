// Bibliographic metadata providers and the parallel fan-out behind add-by-ISBN.
//
// Each provider turns its API's response into a normalised Candidate. The flow
// queries every provider in parallel and is tolerant of any one failing or
// being unavailable (features/add_book_by_isbn.feature). Network I/O is injected
// as `f` so the parsers are unit-testable with fixtures (test/providers.test.ts).

export type Candidate = {
  source: string;
  title?: string;
  subtitle?: string;
  edition_name?: string;
  description?: string;
  published_by?: string;
  published_place?: string;
  published_year?: number;
  authors?: string[];
  editors?: string[];
  translators?: string[];
  illustrators?: string[];
  subjects?: string[];
};

export type FetchFn = typeof fetch;

export interface Provider {
  name: string;
  fetch(isbn13: string, f: FetchFn): Promise<Candidate | null>;
}

/** "Tolkien, J. R. R." -> "J. R. R. Tolkien". */
export function reorderName(name: string): string {
  return name.split(", ").reverse().join(" ").trim();
}

function year(s: unknown): number | undefined {
  const m = String(s ?? "").match(/\d{4}/);
  return m ? Number(m[0]) : undefined;
}

function hasData(c: Candidate): boolean {
  return Object.keys(c).some((k) => k !== "source");
}

// --- Open Library ----------------------------------------------------------
// https://openlibrary.org/isbn/<isbn>.json ; author names need a sub-fetch.
export const openLibrary: Provider = {
  name: "Open Library",
  async fetch(isbn13, f) {
    const res = await f(`https://openlibrary.org/isbn/${isbn13}.json`);
    if (!res.ok) return null;
    const ol = (await res.json()) as Record<string, any>;
    const c: Candidate = { source: this.name };
    if (ol.title) c.title = ol.title;
    if (ol.subtitle) c.subtitle = ol.subtitle;
    if (ol.edition_name) c.edition_name = ol.edition_name;
    if (Array.isArray(ol.publishers)) c.published_by = ol.publishers.join(", ");
    if (Array.isArray(ol.publish_places))
      c.published_place = ol.publish_places.join(", ");
    const y = year(ol.publish_date);
    if (y) c.published_year = y;
    if (typeof ol.description === "string") c.description = ol.description;
    else if (ol.description?.value) c.description = ol.description.value;
    if (Array.isArray(ol.authors)) {
      const names: string[] = [];
      for (const a of ol.authors) {
        if (!a?.key) continue;
        const ar = await f(`https://openlibrary.org${a.key}.json`);
        if (ar.ok) {
          const aj = (await ar.json()) as Record<string, any>;
          if (aj.name) names.push(aj.name);
        }
      }
      if (names.length) c.authors = names;
    }
    return hasData(c) ? c : null;
  },
};

// --- Bibbi (bibliografisk.bs.no) -------------------------------------------
export const bibbi: Provider = {
  name: "Bibbi",
  async fetch(isbn13, f) {
    const res = await f(`https://bibliografisk.bs.no/v1/works?query=${isbn13}`);
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, any>;
    if (j.total !== 1) return null;
    const w = j.works[0];
    const c: Candidate = { source: this.name };
    if (w.name) c.title = w.name;
    if (Array.isArray(w.creator)) {
      const names = w.creator
        .map((a: any) => reorderName(a.name ?? ""))
        .filter(Boolean);
      if (names.length) c.authors = names;
    }
    const pub = (w.publications ?? []).find((p: any) => p.isbn === isbn13);
    if (pub) {
      if (pub.name) c.title = pub.name;
      if (pub.description) c.description = pub.description;
      const subjects: string[] = [];
      for (const s of pub.about ?? []) if (s?.name?.nob) subjects.push(s.name.nob);
      for (const g of pub.genre ?? []) if (g?.name?.nob) subjects.push(g.name.nob);
      if (subjects.length) c.subjects = subjects;
      const y = year(pub.datePublished);
      if (y) c.published_year = y;
    }
    return hasData(c) ? c : null;
  },
};

// --- Libris (libris.kb.se xsearch, refworks/RIS-like text) -----------------
const REFWORKS_FIELDS: Record<string, keyof Candidate | "isbn"> = {
  T1: "title",
  T2: "subtitle",
  ED: "edition_name",
  AB: "description",
  YR: "published_year",
  A1: "authors",
  A2: "editors",
  K1: "subjects",
  PB: "published_by",
  PP: "published_place",
  SN: "isbn",
};

export function parseRefworks(
  block: string,
  isbn13: string,
): Candidate | null {
  const c: Candidate = { source: "Libris" };
  const publishers: string[] = [];
  const places: string[] = [];
  let matched = false;
  for (const line of block.split("\r\n")) {
    if (line.length < 4) continue;
    const key = line.slice(0, 2);
    const value = line.slice(3);
    const field = REFWORKS_FIELDS[key];
    if (!field) continue;
    switch (key) {
      case "A1":
        (c.authors ??= []).push(reorderName(value));
        break;
      case "A2":
        (c.editors ??= []).push(reorderName(value));
        break;
      case "K1":
        (c.subjects ??= []).push(value);
        break;
      case "PB":
        publishers.push(value);
        break;
      case "PP":
        places.push(value);
        break;
      case "YR": {
        const y = year(value);
        if (y) c.published_year = y;
        break;
      }
      case "SN":
        matched = matched || value.replace(/[\s-]/g, "").includes(isbn13);
        break;
      default:
        (c as any)[field] = value;
    }
  }
  if (publishers.length) c.published_by = publishers.join(", ");
  if (places.length) c.published_place = places.join(", ");
  return matched && hasData(c) ? c : null;
}

export const libris: Provider = {
  name: "Libris",
  async fetch(isbn13, f) {
    const res = await f(
      `https://libris.kb.se/xsearch?query=NUMM:${isbn13}&format=refworks`,
    );
    if (!res.ok) return null;
    const text = await res.text();
    for (const block of text.split("\r\n\r\n")) {
      const rec = parseRefworks(block, isbn13);
      if (rec) return rec;
    }
    return null;
  },
};

export const DEFAULT_PROVIDERS: Provider[] = [libris, openLibrary, bibbi];

/** Query every provider in parallel; skip any that fail or return nothing. */
export async function gatherCandidates(
  isbn13: string,
  f: FetchFn,
  providers: Provider[] = DEFAULT_PROVIDERS,
): Promise<Candidate[]> {
  const settled = await Promise.allSettled(
    providers.map((p) => p.fetch(isbn13, f)),
  );
  const out: Candidate[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) out.push(s.value);
  }
  return out;
}
