// D1 data access. Pure query-shaping lives in search.ts; this module runs SQL.
import {
  classifyQuery,
  formatContributors,
  formatLanguages,
  type Contribution,
} from "../search";
import { fold } from "../fold";

export type PersonSuggestion = { id: number; name: string };

/** Existing people whose any name form matches `query`, for the contributor autocomplete. */
export async function suggestContributors(
  db: D1Database,
  query: string,
  limit = 10,
): Promise<PersonSuggestion[]> {
  const q = fold(query);
  if (!q) return [];
  const r = await db
    .prepare(
      `SELECT p.id AS id, p.display_name AS name
       FROM person p JOIN name_form nf ON nf.person_id = p.id
       WHERE nf.text_folded LIKE ?1
       GROUP BY p.id ORDER BY p.display_name LIMIT ?2`,
    )
    .bind(`%${q}%`, limit)
    .all<PersonSuggestion>();
  return r.results;
}

/** Distinct existing values of a free-text book column matching `query`. */
export async function suggestText(
  db: D1Database,
  column: "published_by" | "published_place",
  query: string,
  limit = 10,
): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  const r = await db
    .prepare(
      `SELECT DISTINCT ${column} AS v FROM book
       WHERE ${column} IS NOT NULL AND ${column} LIKE ?1
       ORDER BY ${column} LIMIT ?2`,
    )
    .bind(`%${q}%`, limit)
    .all<{ v: string }>();
  return r.results.map((x) => x.v);
}

export type ResultBook = {
  id: number;
  title: string | null;
  subtitle: string | null;
  contributors: string;
  languages: string;
  shelf_location: string | null;
};

type BookRow = {
  id: number;
  title: string | null;
  subtitle: string | null;
  languages: string | null;
  shelf_location: string | null;
};

const BOOK_COLS = "id, title, subtitle, languages, shelf_location";

/** Search the catalogue. Returns at most 50 books, ordered by title. */
export async function searchBooks(
  db: D1Database,
  raw: string,
): Promise<ResultBook[]> {
  const kind = classifyQuery(raw);
  if (kind.type === "empty") return [];

  let books: BookRow[];
  if (kind.type === "isbn") {
    const r = await db
      .prepare(
        `SELECT ${BOOK_COLS} FROM book
         WHERE isbn_13 LIKE ?1 OR isbn_10 LIKE ?1
         ORDER BY title LIMIT 50`,
      )
      .bind(kind.prefix + "%")
      .all<BookRow>();
    books = r.results;
  } else {
    const r = await db
      .prepare(
        `SELECT b.${BOOK_COLS.split(", ").join(", b.")}
         FROM book_fts f JOIN book b ON b.id = f.rowid
         WHERE book_fts MATCH ?1
         ORDER BY b.title LIMIT 50`,
      )
      .bind(kind.match)
      .all<BookRow>();
    books = r.results;
  }
  if (books.length === 0) return [];

  // Contributors for the matched books, in one query.
  const ids = books.map((b) => b.id);
  const placeholders = ids.map(() => "?").join(",");
  const cr = await db
    .prepare(
      `SELECT book_id, name_as_printed, role, position
       FROM contribution WHERE book_id IN (${placeholders})`,
    )
    .bind(...ids)
    .all<Contribution & { book_id: number }>();

  const byBook = new Map<number, Contribution[]>();
  for (const c of cr.results) {
    const list = byBook.get(c.book_id) ?? [];
    list.push(c);
    byBook.set(c.book_id, list);
  }

  return books.map((b) => ({
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    contributors: formatContributors(byBook.get(b.id) ?? []),
    languages: formatLanguages(b.languages),
    shelf_location: b.shelf_location,
  }));
}
