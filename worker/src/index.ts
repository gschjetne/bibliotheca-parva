import { Hono } from "hono";
import { searchBooks } from "./db";
import { createBook, updateBook, deleteBook, getBookForEdit } from "./mutate";
import { parseBookForm } from "./review";
import { gatherCandidates } from "./providers";
import { isValidIsbn, toIsbn13 } from "./isbn";
import { searchPage, resultRows, reviewForm, editForm } from "./views";
import { verifyAccessJwt, type AccessIdentity } from "./access";

export type Bindings = {
  bibliotheca_parva: D1Database;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_BYPASS?: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: { identity: AccessIdentity } }>();

// --- Cloudflare Access gate (defence in depth) -----------------------------
// The app sits behind Access, which authenticates before the request reaches
// us. We still verify the Access JWT (RS256 against the team JWKS + issuer/
// audience/expiry) so a request that reaches the Worker directly — bypassing the
// Access-protected hostname — is refused. Local dev bypasses with
// ACCESS_BYPASS=true (see .dev.vars).
app.use("*", async (c, next) => {
  if (c.env.ACCESS_BYPASS === "true") {
    c.set("identity", { email: "dev@localhost", sub: "dev" });
    return next();
  }
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  const { ACCESS_TEAM_DOMAIN, ACCESS_AUD } = c.env;
  if (!token || !ACCESS_TEAM_DOMAIN || !ACCESS_AUD) return c.text("Forbidden", 403);
  const identity = await verifyAccessJwt(token, {
    teamDomain: ACCESS_TEAM_DOMAIN,
    aud: ACCESS_AUD,
    fetch,
  });
  if (!identity) return c.text("Forbidden", 403);
  c.set("identity", identity);
  return next();
});

app.get("/health", (c) => c.json({ ok: true }));

app.get("/", (c) => c.html(searchPage()));

// HTMX endpoint: returns the result rows for the catalogue search box.
app.get("/search", async (c) => {
  const books = await searchBooks(c.env.bibliotheca_parva, c.req.query("query") ?? "");
  return c.html(resultRows(books));
});

// Add by ISBN: validate, fan out to every provider in parallel, show the
// field-by-field review screen. Triggered by the home-page ISBN field.
app.post("/lookup", async (c) => {
  const body = await c.req.parseBody();
  const raw = (body["isbn"] ?? "").toString().trim();
  if (!raw) return c.redirect("/add", 303); // blank ISBN -> add by hand
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
  const id = await createBook(c.env.bibliotheca_parva, input);
  return c.redirect(`/books/${id}/edit`, 303);
});

// Edit an existing book.
app.get("/books/:id/edit", async (c) => {
  const id = Number(c.req.param("id"));
  const book = await getBookForEdit(c.env.bibliotheca_parva, id);
  if (!book) return c.notFound();
  return c.html(editForm(book));
});

app.post("/books/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.parseBody();
  const input = parseBookForm((k) => body[k]?.toString());
  await updateBook(c.env.bibliotheca_parva, id, input);
  return c.redirect(`/books/${id}/edit`, 303);
});

app.post("/books/:id/delete", async (c) => {
  await deleteBook(c.env.bibliotheca_parva, Number(c.req.param("id")));
  return c.redirect("/", 303);
});

export default app;
