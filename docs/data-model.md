# Data model — simplified for D1

The Django model used 8 entities and 6 join tables to represent "books with some
contributors and tags." This is the simplified target for D1: **6 tables + 1 FTS
virtual table**, designed to support author identity, name variants, and
full-text search while dropping what production never used.

See `docs/architecture.md` for the platform decisions and
`features/*.feature` for the behaviour this must satisfy.

## What changed and why

| Old                                     | New                                                               | Why                                                            |
| --------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| `Location` table + FK                   | `book.shelf_location` text                                        | 0 rows in production; never used                               |
| 5 role M2M tables (authors, editors, …) | one `contribution` table + `role`                                 | same shape, one table; preserves ordering                      |
| `Person.name` (single string)           | `person` + `name_form` (+ `contribution.name_as_printed`)         | separates identity / spelling / as-printed (authority control) |
| `Person.ol_id`                          | typed authority cols (`ol_key`, `viaf_id`, `isni`, `wikidata_id`) | auto-clustering hook; captured now, enriched later             |
| `languages[]` (Postgres array)          | `book.languages` JSON array of codes                              | SQLite has no array type; display-mostly                       |
| `created_at`/`updated_at` everywhere    | dropped                                                           | nothing reads them                                             |
| `Subject` + `book_subjects`             | `subject` + `book_subject` (unchanged shape)                      | kept as a tag; ready for browse-by-subject later               |

## Shelving (future — not fully thought out)

For now, where a book lives is a single free-text field, `book.shelf_location`.
This is deliberately a placeholder and needs fleshing out later.

The real structure is almost certainly **hierarchical** — e.g.
house → floor → room → bookcase → shelf. A pragmatic interim convention is to
write the location as a filesystem-style path in the free-text field
(e.g. `home/attic/study/north-wall/shelf-3`), which keeps the column simple
while hinting at the hierarchy and staying greppable/sortable.

When we revisit this we should decide between: keeping the path string (with a
documented convention and maybe validation), or promoting it to a proper nested
structure (a `location` tree table with parent references, or a closure/path
table) so locations can be browsed, reused across books, and renamed in one
place. Deferred until the catalogue's shelving needs are clearer; no acceptance
test pins the internal representation, only that a book's shelf location can be
recorded and shown.

## Person identity (authority control)

Three concepts the old model conflated into `Person.name`:

1. **Identity** — the human (`person`). Browse by this. Disambiguate homonyms by
   `birth_year`/`death_year` and external authority IDs.
2. **Name form** — a spelling/transliteration (`name_form`): "Dostoevsky",
   "Достоевский", "Dostoyevsky". Many per person. `text_folded` (accent/ASCII
   folded, lowercased) feeds search.
3. **Name as printed** — exactly what is on _this_ book
   (`contribution.name_as_printed`). Bibliographic fidelity; stored always, with
   zero clustering effort required.

**Clustering** (deciding two name forms are one person) is deferred and largely
automatable: on import, match an incoming authority ID (OpenLibrary key today,
VIAF/ISNI later) to an existing `person` and auto-link. Unmatched names become a
new `person` + `name_form`; `contribution.person_id` may be NULL until known. A
manual merge tool (repoint name_forms + contributions to one canonical person —
the principled successor to `deduplicate_persons.sql`) and VIAF/ISNI enrichment
are Phase 5.

## Schema (D1 / SQLite DDL sketch)

```sql
CREATE TABLE person (
    id            INTEGER PRIMARY KEY,
    display_name  TEXT NOT NULL,          -- preferred form, for headings
    birth_year    INTEGER,
    death_year    INTEGER,
    ol_key        TEXT UNIQUE,            -- OpenLibrary author key
    viaf_id       TEXT UNIQUE,
    isni          TEXT UNIQUE,
    wikidata_id   TEXT UNIQUE
);

CREATE TABLE name_form (
    id          INTEGER PRIMARY KEY,
    person_id   INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,            -- the spelling as-is
    text_folded TEXT NOT NULL,            -- normalised/folded for search
    script      TEXT,                     -- e.g. 'Latn', 'Cyrl' (optional)
    lang        TEXT,                     -- optional
    source      TEXT NOT NULL DEFAULT 'book'   -- 'book' | 'authority'
);
CREATE INDEX name_form_person ON name_form(person_id);
CREATE INDEX name_form_folded ON name_form(text_folded);

CREATE TABLE book (
    id              INTEGER PRIMARY KEY,
    title           TEXT,                 -- nullable (93 prod rows have none)
    subtitle        TEXT,
    original_title  TEXT,
    edition_name    TEXT,
    description     TEXT,
    isbn_13         TEXT,                 -- canonical; indexed for search
    isbn_10         TEXT,                 -- canonical; nullable (979-prefix)
    published_by    TEXT,
    published_place TEXT,
    published_year  INTEGER,
    languages       TEXT,                 -- JSON array of ISO codes, e.g. '["eng"]'
    shelf_location  TEXT,                 -- free text for now; see "Shelving (future)"
    ol_key          TEXT                  -- OpenLibrary work/edition key (re-fetch)
);
CREATE INDEX book_isbn_13 ON book(isbn_13);
CREATE INDEX book_isbn_10 ON book(isbn_10);

CREATE TABLE contribution (
    id             INTEGER PRIMARY KEY,
    book_id        INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
    person_id      INTEGER REFERENCES person(id) ON DELETE SET NULL,  -- NULL until known
    name_as_printed TEXT NOT NULL,        -- fidelity: exactly as on the book
    role           TEXT NOT NULL,         -- 'author'|'editor'|'illustrator'|'translator'|'foreword'
    position       INTEGER NOT NULL DEFAULT 0
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

-- Full-text search. Contributor names are denormalised in here so a search for
-- any spelling resolves to the right books. Maintained on write (app or triggers).
CREATE VIRTUAL TABLE book_fts USING fts5(
    title, subtitle, original_title,
    names,          -- all name_as_printed + persons' name_forms for the book, folded
    subjects,       -- folded subject names
    content=''      -- external/contentless; row maps to book.id
);
```

## Search strategy

- Text search → `book_fts MATCH ?` → book ids → hydrate `book` rows.
- ISBN search → direct lookup on `book.isbn_13` / `book.isbn_10` after
  canonicalising the query (any form, with/without dashes), not FTS.
- Folding handles the Nordic/Cyrillic cases D1's ASCII-only `NOCASE` cannot.

## Old → new migration mapping (for the Phase 4 dump import)

- `books_person` → one `person` (display_name←name, birth_year, ol_key←ol_id)
  **and** one `name_form` (text←name, source='book').
- `books_book_{authors,editors,illustrators,translators,foreword_by}` → one
  `contribution` each, `role` set accordingly, `person_id` linked,
  `name_as_printed`←the person's name (the only name we have), `position` by
  existing order.
- `books_subject` / `books_book_subjects` → `subject` / `book_subject`.
- `books_book` → `book`; `languages[]`→JSON; `location_id`→NULL/drop (no rows);
  `ol_id`→`book.ol_key`.
- `auth_user` → discarded (identity is Cloudflare Access).
- Post-import: rebuild `book_fts`; optionally auto-merge persons sharing an
  `ol_key` (carries forward the intent of `deduplicate_persons.sql`).

```

```
