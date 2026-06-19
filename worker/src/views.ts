import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { ResultBook } from "./db";
import type { Candidate } from "./providers";
import type { EditableBook } from "./mutate";
import { scalarOptions, listOptions, groupContributorsByRole } from "./review";

function layout(title: string, body: HtmlEscapedString | Promise<HtmlEscapedString>) {
  return html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      body { font: 15px/1.5 Georgia, serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; color: #1f2937; }
      h1 { font-family: system-ui, sans-serif; }
      input[name="query"] { width: 22rem; max-width: 100%; padding: .5rem .8rem; border: 1px solid #94a3b8; border-radius: 9999px; }
      table { width: 100%; border-collapse: collapse; margin-top: 1.2rem; font-size: 14px; }
      th, td { border: 1px solid #cbd5e1; padding: .4rem .6rem; text-align: left; vertical-align: top; }
      th { background: #0284c7; color: #fff; font-family: system-ui, sans-serif; }
      tr:nth-child(even) td { background: #f1f5f9; }
      .subtitle { font-style: italic; color: #475569; }
      .muted { color: #94a3b8; }
    </style>
  </head>
  <body>
    ${body}
    <script src="/js/htmx.min.js" defer></script>
  </body>
</html>`;
}

export function searchPage(error?: string) {
  return layout(
    "Bibliotheca Parva",
    html`<h1>Bibliotheca Parva</h1>
    <form method="post" action="/lookup" style="margin-bottom:1rem">
      <input name="isbn" placeholder="Add by ISBN" style="padding:.5rem .8rem;border:1px solid #94a3b8;border-radius:9999px" />
      <button type="submit">Add</button>
      <a href="/add" style="margin-left:.6rem">add without an ISBN</a>
      ${error ? html`<span style="color:#b91c1c;margin-left:.6rem">${error}</span>` : raw("")}
    </form>
    <input
      type="search"
      name="query"
      placeholder="Search title, contributor, or ISBN"
      autofocus
      hx-get="/search"
      hx-trigger="keyup changed delay:150ms, search"
      hx-target="#search-results"
    />
    <table>
      <thead>
        <tr>
          <th style="width:38%">Title</th>
          <th style="width:34%">Contributors</th>
          <th style="width:12%">Language</th>
          <th style="width:12%">Location</th>
          <th style="width:4%"></th>
        </tr>
      </thead>
      <tbody id="search-results" hx-get="/search" hx-trigger="load"></tbody>
    </table>`,
  );
}

/** The <tr> rows swapped into #search-results by HTMX. */
export function resultRows(books: ResultBook[]) {
  if (books.length === 0) {
    return html`<tr><td colspan="5" class="muted">No results.</td></tr>`;
  }
  return html`${books.map(
    (b) => html`<tr>
      <td>
        ${b.title ? html`<strong>${b.title}</strong>` : html`<span class="muted">Missing Title</span>`}
        ${b.subtitle ? html`<div class="subtitle">${b.subtitle}</div>` : raw("")}
      </td>
      <td>${b.contributors}</td>
      <td>${b.languages}</td>
      <td>${b.shelf_location ?? ""}</td>
      <td><a href="/books/${b.id}/edit">edit</a></td>
    </tr>`,
  )}`;
}

const SCALARS: [string, string, "text" | "number" | "textarea"][] = [
  ["title", "Title", "text"],
  ["subtitle", "Subtitle", "text"],
  ["original_title", "Original title", "text"],
  ["edition_name", "Edition", "text"],
  ["published_by", "Publisher", "text"],
  ["published_place", "Place", "text"],
  ["published_year", "Year", "number"],
  ["description", "Description", "textarea"],
];

const LISTS: [string, string, string][] = [
  ["authors", "authors", "Authors"],
  ["editors", "editors", "Editors"],
  ["illustrators", "illustrators", "Illustrators"],
  ["translators", "translators", "Translators"],
  ["subjects", "subjects", "Subjects"],
];

function chips(opts: { source: string; value: string }[]) {
  if (opts.length < 2) return raw("");
  return html`<div class="chips">${opts.map(
    (o) =>
      html`<button type="button" class="chip" data-v="${o.value}" onclick="fillField(this)">${o.source}: ${o.value}</button>`,
  )}</div>`;
}

type FormValues = Record<string, string>;

function emptyValues(): FormValues {
  const v: FormValues = {
    isbn: "",
    languages: "",
    shelf_location: "",
    foreword: "",
    subjects: "",
  };
  for (const [k] of SCALARS) v[k] = "";
  for (const [, f] of LISTS) v[f] = "";
  return v;
}

function valuesFromCandidates(cands: Candidate[], isbn: string | null): FormValues {
  const v = emptyValues();
  v.isbn = isbn ?? "";
  for (const [k] of SCALARS) v[k] = scalarOptions(cands, k)[0]?.value ?? "";
  for (const [k, f] of LISTS) v[f] = listOptions(cands, k)[0]?.names.join("\n") ?? "";
  return v;
}

function valuesFromBook(b: EditableBook): FormValues {
  const v = emptyValues();
  v.isbn = b.isbn_13 ?? b.isbn_10 ?? "";
  v.title = b.title ?? "";
  v.subtitle = b.subtitle ?? "";
  v.original_title = b.original_title ?? "";
  v.edition_name = b.edition_name ?? "";
  v.published_by = b.published_by ?? "";
  v.published_place = b.published_place ?? "";
  v.published_year = b.published_year?.toString() ?? "";
  v.description = b.description ?? "";
  v.shelf_location = b.shelf_location ?? "";
  v.subjects = b.subjects.join("\n");
  try {
    const codes = JSON.parse(b.languages ?? "[]");
    v.languages = Array.isArray(codes) ? codes.join(", ") : "";
  } catch {
    v.languages = "";
  }
  Object.assign(v, groupContributorsByRole(b.contributors));
  return v;
}

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

type FormOpts = {
  heading: Html;
  intro?: Html;
  action: string;
  values: FormValues;
  candidates: Candidate[];
  deleteAction?: string;
};

function renderForm(o: FormOpts) {
  const { values, candidates } = o;

  const scalarRow = (key: string, label: string, type: string) => {
    const value = values[key] ?? "";
    const control =
      type === "textarea"
        ? html`<textarea name="${key}" rows="3">${value}</textarea>`
        : html`<input type="${type === "number" ? "number" : "text"}" name="${key}" value="${value}" />`;
    return html`<div class="field"><label>${label}</label>${control}${chips(scalarOptions(candidates, key))}</div>`;
  };

  const listRow = (key: string, field: string, label: string) => {
    const opt2 = listOptions(candidates, key).map((o) => ({
      source: o.source,
      value: o.names.join("\n"),
    }));
    return html`<div class="field">
      <label>${label} <small class="muted">(one per line)</small></label>
      <textarea name="${field}" rows="2">${values[field] ?? ""}</textarea>
      ${chips(opt2)}
    </div>`;
  };

  return layout(
    "Bibliotheca Parva",
    html`<h1>${o.heading}</h1>
    ${o.intro ? html`<p class="muted">${o.intro}</p>` : raw("")}
    <form method="post" action="${o.action}" class="bookform">
      <div class="field"><label>ISBN</label><input type="text" name="isbn" value="${values.isbn}" /></div>
      ${SCALARS.map(([k, l, t]) => scalarRow(k, l, t))}
      ${LISTS.map(([k, f, l]) => listRow(k, f, l))}
      <div class="field"><label>Foreword by <small class="muted">(one per line)</small></label><textarea name="foreword" rows="2">${values.foreword}</textarea></div>
      <div class="field"><label>Languages <small class="muted">(comma-separated codes)</small></label><input type="text" name="languages" value="${values.languages}" /></div>
      <div class="field"><label>Shelf location</label><input type="text" name="shelf_location" value="${values.shelf_location}" /></div>
      <button type="submit">Save book</button>
      <a href="/" style="margin-left:.6rem">cancel</a>
    </form>
    ${o.deleteAction
      ? html`<form method="post" action="${o.deleteAction}" onsubmit="return confirm('Delete this book?')" style="margin-top:1rem">
          <button type="submit" style="color:#b91c1c">Delete book</button>
        </form>`
      : raw("")}
    <style>
      .bookform { max-width: 40rem; }
      .field { margin: .7rem 0; display: flex; flex-direction: column; gap: .25rem; }
      .field label { font-family: system-ui, sans-serif; font-size: 13px; font-weight: 600; }
      .field input, .field textarea { padding: .4rem .6rem; border: 1px solid #94a3b8; border-radius: .3rem; font: inherit; }
      .chips { display: flex; flex-wrap: wrap; gap: .3rem; }
      .chip { font-size: 12px; padding: .15rem .5rem; border: 1px solid #cbd5e1; border-radius: 9999px; background: #f8fafc; cursor: pointer; }
    </style>
    <script>
      function fillField(btn) {
        const f = btn.closest('.field').querySelector('input, textarea');
        if (f) f.value = btn.getAttribute('data-v');
      }
    </script>`,
  );
}

/** The add/review screen. `candidates` is empty for a manual (no-ISBN) add. */
export function reviewForm(candidates: Candidate[], isbn: string | null) {
  const intro = isbn
    ? candidates.length === 0
      ? html`No bibliographic source recognised this ISBN — fill in the details by hand.`
      : html`From ISBN ${isbn}. Pick the best value for each field, or edit freely.`
    : undefined;
  return renderForm({
    heading: isbn ? html`Review new book` : html`Add a book`,
    intro,
    action: "/books",
    values: valuesFromCandidates(candidates, isbn),
    candidates,
  });
}

/** The edit screen for an existing book. */
export function editForm(book: EditableBook) {
  return renderForm({
    heading: html`Edit ${book.title ?? "untitled book"}`,
    action: `/books/${book.id}`,
    values: valuesFromBook(book),
    candidates: [],
    deleteAction: `/books/${book.id}/delete`,
  });
}
