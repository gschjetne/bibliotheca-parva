import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { ResultBook } from "./db";

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

export function searchPage() {
  return layout(
    "Bibliotheca Parva",
    html`<h1>Bibliotheca Parva</h1>
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
