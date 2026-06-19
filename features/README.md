# Acceptance tests

These Gherkin/Cucumber feature files describe **what Bibliotheca Parva should
do**, so that the rewrite onto Cloudflare serverless can be checked against
real, agreed-upon behaviour rather than against the current Django code.

## How to read them

- They describe **intended behaviour from the librarian's point of view**, not
  the current implementation. For example, the current app edits books inside
  the Django admin and "adds a book" by redirecting to an admin change form —
  the features below talk about "the book's edit page" without caring whether
  that page is the Django admin, a Worker-rendered form, or anything else.
- They are deliberately **runner-agnostic**. No step bindings are committed yet
  because the target stack is still undecided (that is the next phase). Plain
  `.feature` files are the durable artifact; we can wire them to
  `behave`/`pytest-bdd` (Python) or `@cucumber/cucumber` (Workers/TS) once the
  architecture is chosen.
- They describe **the data the librarian cares about** (authors, where a book is
  shelved, what languages it is in) without committing to the normalised data
  model. This is intentional: the data model is being simplified, and these
  tests should still pass afterwards.

## Behaviour we deliberately did NOT codify

The current metadata fetchers contain bugs. We are reimplementing to feature
parity of the *intended* behaviour, so these are specified as they *should*
work, not as they currently misbehave:

- Open Library publication year is never stored (`if find_year in ol:` is a
  membership test, not a truthiness check — `books/models.py:127`).
- The Bibbi fetcher writes `self.year`, a field that does not exist, instead of
  `published_year` (`books/models.py:167`).
- The Libris fetcher copies the title into the subtitle
  (`self.subtitle = title` — `books/models.py:228`).

## Product decisions (resolved)

1. **Empty search** — keep current behaviour: nothing is shown until the
   librarian types. (`search.feature`)
2. **Languages** — replace the strict ISO 639-3 text field with a friendly
   picker: choose from human-readable language names, store a stable code under
   the hood, and offer only recognised languages. (`edit_book.feature`)
3. **Metadata sources — no longer "first wins".** The add-by-ISBN flow queries
   *all* configured sources (Libris, Open Library, Bibbi, and any future
   modules), then shows the librarian what each source returned for each field
   and lets them pick the best value per field, or type their own. The book is
   created from the chosen values when they save. Data quality varies wildly
   between providers and even between individual fields, so there is no single
   winning source. (`add_book_by_isbn.feature`)

### Architectural implications of decision 3

- The ISBN lookup is a **fan-out** across providers; a slow or unavailable
  provider must not block the others (one scenario pins this down).
- Lookup results are **transient candidate data**, held only until the librarian
  saves or cancels — they are not persisted as a book until "save".
- Adding a new metadata provider should be **additive**: it contributes another
  column of candidates without changing the picking UI.
