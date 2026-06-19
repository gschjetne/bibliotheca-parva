#!/usr/bin/env python3
"""Transform the Django/Postgres dump into seed SQL for the new D1 schema.

Reads a pg_dump (optionally bz2-compressed) and emits INSERT statements matching
worker/migrations/0001_init.sql. No database required — the COPY blocks are
parsed directly. See docs/data-model.md for the old->new mapping.

Usage: python3 scripts/import_dump.py ../db-backup.sql.bz2 seed.sql
"""
import bz2
import json
import re
import sys
import unicodedata


def fold(text):
    if not text:
        return ""
    s = unicodedata.normalize("NFD", text)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return " ".join(s.lower().split())


def q(v):
    """Quote a value as a SQL string literal, or NULL."""
    if v is None:
        return "NULL"
    return "'" + v.replace("'", "''") + "'"


def n(v):
    """Render an integer column value, or NULL."""
    if v is None or v == "":
        return "NULL"
    m = re.search(r"-?\d+", v)
    return m.group(0) if m else "NULL"


_UNESCAPE = {"\\t": "\t", "\\n": "\n", "\\r": "\r", "\\\\": "\\"}


def unescape(field):
    if field == r"\N":
        return None
    return re.sub(r"\\[tnr\\]", lambda m: _UNESCAPE[m.group(0)], field)


def read_dump(path):
    opener = bz2.open if path.endswith(".bz2") else open
    with opener(path, "rt", encoding="utf-8") as f:
        return f.read()


def parse_copy(text, table):
    """Return (columns, [rowdict, ...]) for a COPY block, or ([], [])."""
    m = re.search(
        r"^COPY public\.%s \(([^)]*)\) FROM stdin;$" % re.escape(table),
        text,
        re.M,
    )
    if not m:
        return [], []
    cols = [c.strip() for c in m.group(1).split(",")]
    start = m.end() + 1
    end = text.index("\n\\.\n", start)
    body = text[start:end]
    rows = []
    if body:
        for line in body.split("\n"):
            vals = [unescape(f) for f in line.split("\t")]
            rows.append(dict(zip(cols, vals)))
    return cols, rows


def parse_pg_array(v):
    if not v:
        return []
    s = v.strip()
    if s in ("{}", ""):
        return []
    return [x.strip().strip('"') for x in s[1:-1].split(",") if x.strip()]


ROLES = [
    ("books_book_authors", "author"),
    ("books_book_editors", "editor"),
    ("books_book_illustrators", "illustrator"),
    ("books_book_translators", "translator"),
    ("books_book_foreword_by", "foreword"),
]


def main(src, dst):
    text = read_dump(src)
    # No BEGIN/COMMIT: D1 rejects raw SQL transactions; `d1 execute --file`
    # already runs the file atomically.
    out = []

    # --- person + name_form -------------------------------------------------
    _, persons = parse_copy(text, "books_person")
    person_name = {}
    for p in persons:
        pid = p["id"]
        name = p.get("name") or ""
        person_name[pid] = name
        out.append(
            "INSERT INTO person (id, display_name, birth_year, ol_key) "
            f"VALUES ({n(pid)}, {q(name)}, {n(p.get('birth_year'))}, {q(p.get('ol_id'))});"
        )
        out.append(
            "INSERT INTO name_form (person_id, text, text_folded, source) "
            f"VALUES ({n(pid)}, {q(name)}, {q(fold(name))}, 'book');"
        )

    # --- subject + book_subject --------------------------------------------
    _, subjects = parse_copy(text, "books_subject")
    for s in subjects:
        name = s.get("name") or ""
        out.append(
            "INSERT INTO subject (id, name, name_folded) "
            f"VALUES ({n(s['id'])}, {q(name)}, {q(fold(name))});"
        )

    # --- book ---------------------------------------------------------------
    _, books = parse_copy(text, "books_book")
    book_ids = []
    for b in books:
        book_ids.append(b["id"])
        langs = parse_pg_array(b.get("languages"))
        languages = q(json.dumps(langs)) if langs else "NULL"
        out.append(
            "INSERT INTO book (id, title, subtitle, original_title, edition_name, "
            "description, isbn_13, isbn_10, published_by, published_place, "
            "published_year, languages, ol_key) VALUES ("
            f"{n(b['id'])}, {q(b.get('title'))}, {q(b.get('subtitle'))}, "
            f"{q(b.get('original_title'))}, {q(b.get('edition_name'))}, "
            f"{q(b.get('description'))}, {q(b.get('isbn_13'))}, {q(b.get('isbn_10'))}, "
            f"{q(b.get('published_by'))}, {q(b.get('published_place'))}, "
            f"{n(b.get('published_year'))}, {languages}, {q(b.get('ol_id'))});"
        )

    _, bsubs = parse_copy(text, "books_book_subjects")
    book_subject_names = {}  # book_id -> [name]
    for bs in bsubs:
        out.append(
            "INSERT OR IGNORE INTO book_subject (book_id, subject_id) "
            f"VALUES ({n(bs['book_id'])}, {n(bs['subject_id'])});"
        )

    # --- contribution (5 role join tables -> one table) ---------------------
    book_names = {}  # book_id -> [name_as_printed] for FTS
    position = {}  # book_id -> running position
    for table, role in ROLES:
        _, links = parse_copy(text, table)
        for link in links:
            bid, pid = link["book_id"], link["person_id"]
            name = person_name.get(pid, "")
            pos = position.get(bid, 0)
            position[bid] = pos + 1
            book_names.setdefault(bid, []).append(name)
            out.append(
                "INSERT INTO contribution (book_id, person_id, name_as_printed, role, position) "
                f"VALUES ({n(bid)}, {n(pid)}, {q(name)}, '{role}', {pos});"
            )

    # subject names per book for FTS
    subject_name = {s["id"]: (s.get("name") or "") for s in subjects}
    for bs in bsubs:
        book_subject_names.setdefault(bs["book_id"], []).append(
            subject_name.get(bs["subject_id"], "")
        )

    # --- book_fts (denormalised search index) -------------------------------
    by_id = {b["id"]: b for b in books}
    for bid in book_ids:
        b = by_id[bid]
        names = " ".join(fold(x) for x in book_names.get(bid, []))
        subs = " ".join(fold(x) for x in book_subject_names.get(bid, []))
        out.append(
            "INSERT INTO book_fts (rowid, title, subtitle, original_title, names, subjects) "
            f"VALUES ({n(bid)}, {q(b.get('title'))}, {q(b.get('subtitle'))}, "
            f"{q(b.get('original_title'))}, {q(names)}, {q(subs)});"
        )

    with open(dst, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")

    print(
        f"Wrote {dst}: {len(persons)} persons, {len(subjects)} subjects, "
        f"{len(books)} books."
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: import_dump.py <dump.sql[.bz2]> <out.sql>")
    main(sys.argv[1], sys.argv[2])
