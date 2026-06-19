// D1 write path: create a book from a BookInput, keeping persons, contributions,
// subjects and the FTS index in sync. Pure parsing lives in review.ts.
import { fold } from "./fold";
import { toIsbn10, toIsbn13 } from "./isbn";
import type { BookInput } from "./review";

/** Insert a new book and everything hanging off it. Returns the new book id. */
export async function createBook(db: D1Database, input: BookInput): Promise<number> {
  const isbn13 = input.isbn ? toIsbn13(input.isbn) : null;
  const isbn10 = input.isbn ? toIsbn10(input.isbn) : null;
  const languages = input.languages.length ? JSON.stringify(input.languages) : null;

  const res = await db
    .prepare(
      `INSERT INTO book
       (title, subtitle, original_title, edition_name, description,
        isbn_13, isbn_10, published_by, published_place, published_year,
        languages, shelf_location)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      input.title,
      input.subtitle,
      input.original_title,
      input.edition_name,
      input.description,
      isbn13,
      isbn10,
      input.published_by,
      input.published_place,
      input.published_year,
      languages,
      input.shelf_location,
    )
    .run();
  const bookId = res.meta.last_row_id as number;

  // Contributors: a fresh person + name_form each (clustering is deferred —
  // see docs/data-model.md), then the contribution linking them to the book.
  let position = 0;
  for (const ct of input.contributors) {
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

  // Subjects: get-or-create by name, then link.
  for (const name of input.subjects) {
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

  // FTS row: contributor names (foreword excluded, matching the search display)
  // and subjects, folded.
  const names = input.contributors
    .filter((c) => c.role !== "foreword")
    .map((c) => fold(c.name))
    .join(" ");
  const subjects = input.subjects.map(fold).join(" ");
  await db
    .prepare(
      `INSERT INTO book_fts (rowid, title, subtitle, original_title, names, subjects)
       VALUES (?,?,?,?,?,?)`,
    )
    .bind(bookId, input.title, input.subtitle, input.original_title, names, subjects)
    .run();

  return bookId;
}
