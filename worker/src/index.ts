import { Hono } from "hono";
import { searchBooks } from "./db";
import { createBook, updateBook, deleteBook, getBookForEdit } from "./mutate";
import { parseBookForm } from "./review";
import { gatherCandidates } from "./providers";
import { isValidIsbn, toIsbn13 } from "./isbn";
import { searchPage, resultRows, reviewForm, editForm } from "./views";

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_BYPASS?: string;
};

type Identity = { email: string };

const app = new Hono<{ Bindings: Bindings; Variables: { identity: Identity } }>();

// --- Cloudflare Access gate (defence in depth) -----------------------------
// In production the app sits behind Access, which authenticates before the
// request reaches us. We still check the Access JWT here so a direct hit on the
// Worker URL (bypassing the protected hostname) is refused.
//
// TODO(phase 4): full RS256 verification against the team JWKS
//   https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs  + audience (AUD) check.
// Until then we decode (do not verify) the identity. Local dev bypasses with
// ACCESS_BYPASS=true.
app.use("*", async (c, next) => {
  if (c.env.ACCESS_BYPASS === "true") {
    c.set("identity", { email: "dev@localhost" });
    return next();
  }
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  const identity = token ? decodeIdentity(token) : null;
  if (!identity) return c.text("Forbidden", 403);
  c.set("identity", identity);
  return next();
});

function decodeIdentity(jwt: string): Identity | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { email?: unknown };
    return typeof payload.email === "string" ? { email: payload.email } : null;
  } catch {
    return null;
  }
}

app.get("/health", (c) => c.json({ ok: true }));

app.get("/", (c) => c.html(searchPage()));

// HTMX endpoint: returns the result rows for the catalogue search box.
app.get("/search", async (c) => {
  const books = await searchBooks(c.env.DB, c.req.query("query") ?? "");
  return c.html(resultRows(books));
});

// Add by ISBN: validate, fan out to every provider in parallel, show the
// field-by-field review screen. Triggered by the home-page ISBN field.
app.post("/lookup", async (c) => {
  const body = await c.req.parseBody();
  const raw = (body["isbn"] ?? "").toString().trim();
  if (!isValidIsbn(raw)) {
    return c.html(searchPage(`"${raw}" is not a valid ISBN.`));
  }
  const isbn13 = toIsbn13(raw)!;
  const candidates = await gatherCandidates(isbn13, fetch);
  return c.html(reviewForm(candidates, isbn13));
});

// Add without an ISBN: a blank review screen.
app.get("/add", (c) => c.html(reviewForm([], null)));

// Save a new book from the review screen.
app.post("/books", async (c) => {
  const body = await c.req.parseBody();
  const input = parseBookForm((k) => body[k]?.toString());
  const id = await createBook(c.env.DB, input);
  return c.redirect(`/books/${id}/edit`, 303);
});

// Edit an existing book.
app.get("/books/:id/edit", async (c) => {
  const id = Number(c.req.param("id"));
  const book = await getBookForEdit(c.env.DB, id);
  if (!book) return c.notFound();
  return c.html(editForm(book));
});

app.post("/books/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const input = parseBookForm((k) => body[k]?.toString());
  await updateBook(c.env.DB, id, input);
  return c.redirect(`/books/${id}/edit`, 303);
});

app.post("/books/:id/delete", async (c) => {
  await deleteBook(c.env.DB, Number(c.req.param("id")));
  return c.redirect("/", 303);
});

export default app;
