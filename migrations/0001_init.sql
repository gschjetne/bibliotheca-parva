-- Initial schema for Bibliotheca Parva on D1. See docs/data-model.md.

CREATE TABLE person (
    id            INTEGER PRIMARY KEY,
    display_name  TEXT NOT NULL,
    birth_year    INTEGER,
    death_year    INTEGER,
    ol_key        TEXT UNIQUE,
    viaf_id       TEXT UNIQUE,
    isni          TEXT UNIQUE,
    wikidata_id   TEXT UNIQUE
);

CREATE TABLE name_form (
    id          INTEGER PRIMARY KEY,
    person_id   INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    text_folded TEXT NOT NULL,
    script      TEXT,
    lang        TEXT,
    source      TEXT NOT NULL DEFAULT 'book'
);
CREATE INDEX name_form_person ON name_form(person_id);
CREATE INDEX name_form_folded ON name_form(text_folded);

CREATE TABLE book (
    id              INTEGER PRIMARY KEY,
    title           TEXT,
    subtitle        TEXT,
    original_title  TEXT,
    edition_name    TEXT,
    description     TEXT,
    isbn_13         TEXT,
    isbn_10         TEXT,
    published_by    TEXT,
    published_place TEXT,
    published_year  INTEGER,
    languages       TEXT,           -- JSON array of ISO codes, e.g. '["eng"]'
    shelf_location  TEXT,           -- free text for now; see docs/data-model.md
    ol_key          TEXT
);
CREATE INDEX book_isbn_13 ON book(isbn_13);
CREATE INDEX book_isbn_10 ON book(isbn_10);

CREATE TABLE contribution (
    id              INTEGER PRIMARY KEY,
    book_id         INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
    person_id       INTEGER REFERENCES person(id) ON DELETE SET NULL,
    name_as_printed TEXT NOT NULL,
    role            TEXT NOT NULL,  -- author|editor|illustrator|translator|foreword
    position        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX contribution_book   ON contribution(book_id);
CREATE INDEX contribution_person ON contribution(person_id);

CREATE TABLE subject (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    name_folded TEXT NOT NULL
);
CREATE TABLE book_subject (
    book_id    INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, subject_id)
);

-- Full-text search. Contributor names + subjects are denormalised in here so a
-- search for any spelling resolves to the right books. rowid == book.id.
-- A regular (content-storing) FTS5 table so rows can be updated/deleted by
-- rowid when a book is edited or removed.
CREATE VIRTUAL TABLE book_fts USING fts5(
    title, subtitle, original_title, names, subjects
);
