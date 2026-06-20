-- Minimal acceptance-test seed for CI.
--
-- The full local seed (~1700 books) is generated from a private backup that is
-- never committed (see .gitignore: db-backup.sql.bz2 / seed.sql). CI instead
-- loads just the rows the seed-dependent specs need: search.e2e.ts looks up
-- "Norwegian wood" by its contributor "Murakami" (case-insensitively).
--
-- Mirrors what src/lib/server/mutate.ts writes: a person + name_form, the book,
-- a contribution, and a denormalised book_fts row whose `names` column holds the
-- folded contributor name so a name search resolves to the book (rowid == book.id).

INSERT INTO person (id, display_name) VALUES (1, 'Haruki Murakami');
INSERT INTO name_form (person_id, text, text_folded, source)
  VALUES (1, 'Haruki Murakami', 'haruki murakami', 'book');

INSERT INTO book (id, title, languages) VALUES (1, 'Norwegian wood', '["jpn"]');
INSERT INTO contribution (book_id, person_id, name_as_printed, role, position)
  VALUES (1, 1, 'Haruki Murakami', 'author', 0);

INSERT INTO book_fts (rowid, title, subtitle, original_title, names, subjects)
  VALUES (1, 'Norwegian wood', NULL, NULL, 'haruki murakami', '');
