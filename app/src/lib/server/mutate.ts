// D1 write path: create / update / delete a book, keeping persons,
// contributions, subjects and the FTS index in sync. Pure parsing lives in
// review.ts.
import { fold } from "../fold";
import { toIsbn10, toIsbn13 } from "../isbn";
import type { BookInput, ContributorInput } from "../review";

export type EditableBook = {
  id: number;
  title: string | null;
  subtitle: string | null;
  original_title: string | null;
  edition_name: string | null;
  description: string | null;
  isbn_13: string | null;
  isbn_10: string | null;
  published_by: string | null;
  published_place: string | null;
  published_year: number | null;
  languages: string | null;
  shelf_location: string | null;
  contributors: { name_as_printed: string; role: string; position: number }[];
  subjects: string[];
};

const BOOK_FIELDS = [
  "title",
  "subtitle",
  "original_title",
  "edition_name",
  "description",
  "isbn_13",
  "isbn_10",
  "published_by",
  "published_place",
  "published_year",
  "languages",
  "shelf_location",
] as const;

function bookColumnValues(input: BookInput) {
  return {
    title: input.title,
    subtitle: input.subtitle,
    original_title: input.original_title,
    edition_name: input.edition_name,
    description: input.description,
    isbn_13: input.isbn ? toIsbn13(input.isbn) : null,
    isbn_10: input.isbn ? toIsbn10(input.isbn) : null,
    published_by: input.published_by,
    published_place: input.published_place,
    published_year: input.published_year,
    languages: input.languages.length ? JSON.stringify(input.languages) : null,
    shelf_location: input.shelf_location,
  };
}

async function insertContributors(
  db: D1Database,
  bookId: number,
  contributors: ContributorInput[],
) {
  let position = 0;
  for (const ct of contributors) {
    const pr = await db
      .prepare(`INSERT INTO person (display_name) VALUES (?)`)
      .bind(ct.name)
      .run();
    const personId = pr.meta.last_row_id as number;
    await db
      .prepare(
        `INSERT INTO name_form (person_id, text, text_folded, source)
         VALUES (?,?,?,'book')`,
      )
      .bind(personId, ct.name, fold(ct.name))
      .run();
    await db
      .prepare(
        `INSERT INTO contribution (book_id, person_id, name_as_printed, role, position)
         VALUES (?,?,?,?,?)`,
      )
      .bind(bookId, personId, ct.name, ct.role, position++)
      .run();
  }
}

async function linkSubjects(db: D1Database, bookId: number, subjects: string[]) {
  for (const name of subjects) {
    await db
      .prepare(`INSERT OR IGNORE INTO subject (name, name_folded) VALUES (?,?)`)
      .bind(name, fold(name))
      .run();
    const row = await db
      .prepare(`SELECT id FROM subject WHERE name = ?`)
      .bind(name)
      .first<{ id: number }>();
    if (row) {
      await db
        .prepare(`INSERT OR IGNORE INTO book_subject (book_id, subject_id) VALUES (?,?)`)
        .bind(bookId, row.id)
        .run();
    }
  }
}

/** Replace the FTS row for a book (delete-then-insert works on regular FTS5). */
async function writeFts(db: D1Database, bookId: number, input: BookInput) {
  const names = input.contributors
    .filter((c) => c.role !== "foreword")
    .map((c) => fold(c.name))
    .join(" ");
  const subjects = input.subjects.map(fold).join(" ");
  await db.prepare(`DELETE FROM book_fts WHERE rowid = ?`).bind(bookId).run();
  await db
    .prepare(
      `INSERT INTO book_fts (rowid, title, subtitle, original_title, names, subjects)
       VALUES (?,?,?,?,?,?)`,
    )
    .bind(bookId, input.title, input.subtitle, input.original_title, names, subjects)
    .run();
}

/** Delete persons no longer referenced by any contribution (and their name_forms). */
async function pruneOrphanPersons(db: D1Database) {
  await db
    .prepare(
      `DELETE FROM person
       WHERE id NOT IN (SELECT person_id FROM contribution WHERE person_id IS NOT NULL)`,
    )
    .run();
}

export async function createBook(db: D1Database, input: BookInput): Promise<number> {
  const v = bookColumnValues(input);
  const res = await db
    .prepare(
      `INSERT INTO book (${BOOK_FIELDS.join(", ")})
       VALUES (${BOOK_FIELDS.map(() => "?").join(", ")})`,
    )
    .bind(...BOOK_FIELDS.map((f) => v[f]))
    .run();
  const bookId = res.meta.last_row_id as number;
  await insertContributors(db, bookId, input.contributors);
  await linkSubjects(db, bookId, input.subjects);
  await writeFts(db, bookId, input);
  return bookId;
}

export async function updateBook(
  db: D1Database,
  id: number,
  input: BookInput,
): Promise<void> {
  const v = bookColumnValues(input);
  await db
    .prepare(`UPDATE book SET ${BOOK_FIELDS.map((f) => `${f} = ?`).join(", ")} WHERE id = ?`)
    .bind(...BOOK_FIELDS.map((f) => v[f]), id)
    .run();
  // Replace contributors and subjects wholesale.
  await db.prepare(`DELETE FROM contribution WHERE book_id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM book_subject WHERE book_id = ?`).bind(id).run();
  await insertContributors(db, id, input.contributors);
  await linkSubjects(db, id, input.subjects);
  await writeFts(db, id, input);
  await pruneOrphanPersons(db);
}

export async function deleteBook(db: D1Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM contribution WHERE book_id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM book_subject WHERE book_id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM book_fts WHERE rowid = ?`).bind(id).run();
  await db.prepare(`DELETE FROM book WHERE id = ?`).bind(id).run();
  await pruneOrphanPersons(db);
}

/** Load a book and its contributors/subjects for the edit form, or null. */
export async function getBookForEdit(
  db: D1Database,
  id: number,
): Promise<EditableBook | null> {
  const book = await db
    .prepare(`SELECT * FROM book WHERE id = ?`)
    .bind(id)
    .first<Omit<EditableBook, "contributors" | "subjects">>();
  if (!book) return null;
  const cr = await db
    .prepare(
      `SELECT name_as_printed, role, position FROM contribution
       WHERE book_id = ? ORDER BY position`,
    )
    .bind(id)
    .all<{ name_as_printed: string; role: string; position: number }>();
  const sr = await db
    .prepare(
      `SELECT s.name FROM book_subject bs JOIN subject s ON s.id = bs.subject_id
       WHERE bs.book_id = ? ORDER BY s.name`,
    )
    .bind(id)
    .all<{ name: string }>();
  return { ...book, contributors: cr.results, subjects: sr.results.map((r) => r.name) };
}
