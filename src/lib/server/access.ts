// Cloudflare Access JWT verification (defence in depth).
//
// Access authenticates the user at the edge and forwards the request with a
// signed JWT in the `Cf-Access-Jwt-Assertion` header. We verify that token's
// RS256 signature against the team's public keys (JWKS) and check issuer,
// audience and expiry, so a request that reaches the Worker directly — bypassing
// the Access-protected hostname — is rejected. See features/authentication.feature.

export type AccessIdentity = { email: string; sub: string };

export type VerifyOptions = {
  teamDomain: string; // e.g. "myteam.cloudflareaccess.com"
  aud: string; // the Access application's AUD tag
  fetch: typeof fetch;
  now?: number; // ms epoch, injectable for tests
};

type Jwk = JsonWebKey & { kid?: string };

// Per-isolate JWKS cache. Access certs rotate infrequently; an hour is safe.
const jwksCache = new Map<string, { keys: Jwk[]; expires: number }>();
const JWKS_TTL_MS = 60 * 60 * 1000;

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeJson(part: string): any {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
}

async function fetchJwks(
  url: string,
  f: typeof fetch,
  now: number,
): Promise<Jwk[]> {
  const cached = jwksCache.get(url);
  if (cached && cached.expires > now) return cached.keys;
  const res = await f(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys?: Jwk[] };
  const keys = data.keys ?? [];
  jwksCache.set(url, { keys, expires: now + JWKS_TTL_MS });
  return keys;
}

/** Verify an Access JWT. Returns the identity, or null if invalid. */
export async function verifyAccessJwt(
  token: string,
  opts: VerifyOptions,
): Promise<AccessIdentity | null> {
  const now = opts.now ?? Date.now();
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header: any;
  let payload: any;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const issuer = `https://${opts.teamDomain}`;
  if (payload.iss !== issuer) return null;

  const aud = payload.aud;
  const audOk = Array.isArray(aud) ? aud.includes(opts.aud) : aud === opts.aud;
  if (!audOk) return null;

  const nowSec = Math.floor(now / 1000);
  if (typeof payload.exp === "number" && payload.exp < nowSec) return null;
  if (typeof payload.nbf === "number" && payload.nbf > nowSec) return null;

  let keys: Jwk[];
  try {
    keys = await fetchJwks(`${issuer}/cdn-cgi/access/certs`, opts.fetch, now);
  } catch {
    return null;
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return null;
  }

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(parts[2]),
    data,
  );
  if (!ok) return null;

  if (typeof payload.email !== "string") return null;
  return { email: payload.email, sub: typeof payload.sub === "string" ? payload.sub : "" };
}
