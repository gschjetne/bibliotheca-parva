import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { ResultBook } from "./db";
import type { Candidate } from "./providers";
import type { EditableBook } from "./mutate";
import { scalarOptions, listOptions, groupContributorsByRole } from "./review";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

// Ported from the Django templates (base.html) so the look matches the
// original app. Tailwind is built from these classes (see tailwind.config.js).
function layout(title: string, body: Html) {
  return html`<!DOCTYPE html>
<html lang="en">
  <head>
    <title>${title}</title>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body class="bg-gray-50 font-serif leading-normal tracking-normal">
    <div class="container mx-auto p-5">
      ${body}
      <script src="/js/htmx.min.js" defer></script>
    </div>
  </body>
</html>`;
}

const INPUT = "border border-slate-500 shadow-inner rounded-full text-xs p-2 m-1";
const BUTTON =
  "border border-slate-500 bg-sky-600 text-white shadow-md p-2 m-1 font-sans font-bold text-xs uppercase rounded-full cursor-pointer";
const CELL = "p-2 border border-slate-300";

// Home page: search box + add-by-ISBN form + results table (from index.html).
export function searchPage(error?: string) {
  return layout(
    "Bibliotheca Parva",
    html`<div class="flex justify-between">
      <div>
        <input
          class="${INPUT} w-80"
          type="search"
          name="query"
          placeholder="Search"
          hx-get="/search"
          hx-trigger="keyup changed delay:100ms, search"
          hx-target="#search-results"
        />
      </div>
      <form method="post" action="/lookup">
        <input class="${INPUT}" name="isbn" placeholder="ISBN" />
        <input class="${BUTTON}" type="submit" value="Add" />
        ${error ? html`<span class="text-xs text-red-600">${error}</span>` : raw("")}
      </form>
    </div>

    <table class="table-fixed text-xs border border-slate-500 mt-5 w-full shadow-md">
      <thead class="font-sans">
        <tr class="bg-sky-600 text-white">
          <th class="w-4/12 ${CELL}">Title</th>
          <th class="w-4/12 ${CELL}">Contributors</th>
          <th class="w-2/12 ${CELL}">Language</th>
          <th class="w-1/12 ${CELL}">Location</th>
          <th class="w-1/12 ${CELL}"></th>
        </tr>
      </thead>
      <tbody id="search-results" hx-trigger="load" hx-get="/search"></tbody>
    </table>`,
  );
}

// The <tr> rows swapped into #search-results by HTMX (from search.html).
export function resultRows(books: ResultBook[]) {
  return html`${books.map(
    (b) => html`<tr class="odd:bg-slate-200">
      <td class="${CELL}">
        <p class="font-bold">${b.title ? b.title : html`<span class="text-slate-400">Missing Title</span>`}</p>
        <p class="italic">${b.subtitle ?? ""}</p>
      </td>
      <td class="${CELL}">${b.contributors}</td>
      <td class="${CELL}">${b.languages}</td>
      <td class="${CELL}">${b.shelf_location ?? ""}</td>
      <td class="${CELL}"><a class="text-sky-700 underline" href="/books/${b.id}/edit">edit</a></td>
    </tr>`,
  )}`;
}

// --- add / edit form -------------------------------------------------------
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

const FIELD_INPUT =
  "border border-slate-500 shadow-inner rounded-full text-xs p-2 w-full";
const FIELD_TEXTAREA = "border border-slate-500 shadow-inner rounded text-xs p-2 w-full";
const LABEL = "font-sans font-bold text-xs uppercase text-slate-600";

function chips(opts: { source: string; value: string }[]) {
  if (opts.length < 2) return raw("");
  return html`<div class="flex flex-wrap gap-1 mt-1">${opts.map(
    (o) =>
      html`<button
        type="button"
        class="border border-slate-300 rounded-full text-xs px-2 py-1 bg-white hover:bg-slate-100 cursor-pointer"
        data-v="${o.value}"
        onclick="fillField(this)"
      >${o.source}: ${o.value}</button>`,
  )}</div>`;
}

type FormValues = Record<string, string>;

function emptyValues(): FormValues {
  const v: FormValues = { isbn: "", languages: "", shelf_location: "", foreword: "", subjects: "" };
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

type FormOpts = {
  heading: Html;
  intro?: Html;
  action: string;
  values: FormValues;
  candidates: Candidate[];
  deleteAction?: string;
};

function field(label: string, control: Html, extra: Html = raw("")) {
  return html`<div class="mb-3">
    <label class="block ${LABEL} mb-1">${label}</label>
    ${control}${extra}
  </div>`;
}

function renderForm(o: FormOpts) {
  const { values, candidates } = o;

  const scalarRow = (key: string, label: string, type: string) => {
    const value = values[key] ?? "";
    const control =
      type === "textarea"
        ? html`<textarea name="${key}" rows="3" class="${FIELD_TEXTAREA}">${value}</textarea>`
        : html`<input type="${type === "number" ? "number" : "text"}" name="${key}" value="${value}" class="${FIELD_INPUT}" />`;
    return field(label, control, chips(scalarOptions(candidates, key)));
  };

  const listRow = (key: string, fieldName: string, label: string) => {
    const opt2 = listOptions(candidates, key).map((o) => ({ source: o.source, value: o.names.join("\n") }));
    const control = html`<textarea name="${fieldName}" rows="2" class="${FIELD_TEXTAREA}">${values[fieldName] ?? ""}</textarea>`;
    return field(`${label} (one per line)`, control, chips(opt2));
  };

  return layout(
    "Bibliotheca Parva",
    html`<h1 class="font-bold font-sans text-lg mb-1">${o.heading}</h1>
    ${o.intro ? html`<p class="text-xs italic text-slate-500 mb-3">${o.intro}</p>` : raw("")}
    <form method="post" action="${o.action}" class="max-w-2xl">
      ${field("ISBN", html`<input type="text" name="isbn" value="${values.isbn}" class="${FIELD_INPUT}" />`)}
      ${SCALARS.map(([k, l, t]) => scalarRow(k, l, t))}
      ${LISTS.map(([k, f, l]) => listRow(k, f, l))}
      ${field("Foreword by (one per line)", html`<textarea name="foreword" rows="2" class="${FIELD_TEXTAREA}">${values.foreword}</textarea>`)}
      ${field("Languages (comma-separated codes)", html`<input type="text" name="languages" value="${values.languages}" class="${FIELD_INPUT}" />`)}
      ${field("Shelf location", html`<input type="text" name="shelf_location" value="${values.shelf_location}" class="${FIELD_INPUT}" />`)}
      <div class="mt-4">
        <input type="submit" value="Save book" class="${BUTTON}" />
        <a href="/" class="text-xs text-slate-500 ml-2">cancel</a>
      </div>
    </form>
    ${o.deleteAction
      ? html`<form method="post" action="${o.deleteAction}" onsubmit="return confirm('Delete this book?')" class="mt-4 max-w-2xl">
          <input type="submit" value="Delete book" class="border border-red-700 text-red-700 p-2 font-sans font-bold text-xs uppercase rounded-full cursor-pointer" />
        </form>`
      : raw("")}
    <script>
      function fillField(btn) {
        const f = btn.closest('div').querySelector('input, textarea');
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
