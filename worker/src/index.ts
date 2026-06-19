import { Hono } from "hono";
import { searchBooks } from "./db";
import { searchPage, resultRows } from "./views";

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

// Placeholder — the edit screen arrives in a later iteration.
app.get("/books/:id/edit", (c) =>
  c.html(`<p>Editing book ${c.req.param("id")} — coming soon.</p>`),
);

export default app;
