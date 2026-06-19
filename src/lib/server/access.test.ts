import { describe, it, expect, beforeAll } from "vitest";
import { verifyAccessJwt } from "./access";

// Mint real RS256 JWTs with a generated keypair and serve the public key as a
// JWKS, so verification is exercised for real (not mocked).

const b64url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlJson = (o: unknown) =>
  b64url(new TextEncoder().encode(JSON.stringify(o)));

let privateKey: CryptoKey;
let jwk: JsonWebKey & { kid: string };

beforeAll(async () => {
  const kp = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  privateKey = kp.privateKey;
  const pub = (await crypto.subtle.exportKey("jwk", kp.publicKey)) as JsonWebKey;
  jwk = { ...pub, kid: "k1", alg: "RS256" };
});

async function mint(
  payload: Record<string, unknown>,
  opts: { kid?: string; key?: CryptoKey } = {},
) {
  const header = { alg: "RS256", typ: "JWT", kid: opts.kid ?? "k1" };
  const input = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    opts.key ?? privateKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

// Each test uses a distinct team domain so the per-isolate JWKS cache (keyed by
// URL) never serves another test's key.
let n = 0;
function opts(extra: Partial<{ aud: string; now: number }> = {}) {
  const teamDomain = `t${++n}.cloudflareaccess.com`;
  return {
    teamDomain,
    issuer: `https://${teamDomain}`,
    verify: {
      teamDomain,
      aud: extra.aud ?? "app-aud",
      now: extra.now ?? 1_700_000_000_000,
      fetch: (async (url: string | URL | Request) =>
        String(url).endsWith("/cdn-cgi/access/certs")
          ? new Response(JSON.stringify({ keys: [jwk] }))
          : new Response("", { status: 404 })) as typeof fetch,
    },
  };
}

const NOW_SEC = 1_700_000_000;

describe("verifyAccessJwt", () => {
  it("accepts a valid token and returns the identity", async () => {
    const o = opts();
    const token = await mint({
      iss: o.issuer,
      aud: "app-aud",
      email: "ada@home.test",
      sub: "abc",
      exp: NOW_SEC + 600,
    });
    expect(await verifyAccessJwt(token, o.verify)).toEqual({
      email: "ada@home.test",
      sub: "abc",
    });
  });

  it("accepts an audience array containing the aud", async () => {
    const o = opts();
    const token = await mint({
      iss: o.issuer,
      aud: ["other", "app-aud"],
      email: "ada@home.test",
      exp: NOW_SEC + 600,
    });
    expect(await verifyAccessJwt(token, o.verify)).toMatchObject({ email: "ada@home.test" });
  });

  it("rejects an expired token", async () => {
    const o = opts();
    const token = await mint({ iss: o.issuer, aud: "app-aud", email: "a@b.c", exp: NOW_SEC - 1 });
    expect(await verifyAccessJwt(token, o.verify)).toBeNull();
  });

  it("rejects a wrong audience", async () => {
    const o = opts();
    const token = await mint({ iss: o.issuer, aud: "someone-else", email: "a@b.c", exp: NOW_SEC + 600 });
    expect(await verifyAccessJwt(token, o.verify)).toBeNull();
  });

  it("rejects a wrong issuer", async () => {
    const o = opts();
    const token = await mint({ iss: "https://evil.example", aud: "app-aud", email: "a@b.c", exp: NOW_SEC + 600 });
    expect(await verifyAccessJwt(token, o.verify)).toBeNull();
  });

  it("rejects an unknown key id", async () => {
    const o = opts();
    const token = await mint(
      { iss: o.issuer, aud: "app-aud", email: "a@b.c", exp: NOW_SEC + 600 },
      { kid: "unknown" },
    );
    expect(await verifyAccessJwt(token, o.verify)).toBeNull();
  });

  it("rejects a tampered payload (bad signature)", async () => {
    const o = opts();
    const token = await mint({ iss: o.issuer, aud: "app-aud", email: "a@b.c", exp: NOW_SEC + 600 });
    const [h, , s] = token.split(".");
    const forged = b64urlJson({ iss: o.issuer, aud: "app-aud", email: "attacker@evil.test", exp: NOW_SEC + 600 });
    expect(await verifyAccessJwt(`${h}.${forged}.${s}`, o.verify)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    const o = opts();
    expect(await verifyAccessJwt("not.a.jwt", o.verify)).toBeNull();
    expect(await verifyAccessJwt("garbage", o.verify)).toBeNull();
  });

  it("defaults sub to an empty string when the token has no sub claim", async () => {
    const o = opts();
    const token = await mint({ iss: o.issuer, aud: "app-aud", email: "ada@home.test", exp: NOW_SEC + 600 });
    expect(await verifyAccessJwt(token, o.verify)).toEqual({ email: "ada@home.test", sub: "" });
  });

  it("rejects a token with no email claim", async () => {
    const o = opts();
    const token = await mint({ iss: o.issuer, aud: "app-aud", sub: "abc", exp: NOW_SEC + 600 });
    expect(await verifyAccessJwt(token, o.verify)).toBeNull();
  });

  it("uses the real clock when no `now` is injected", async () => {
    const o = opts();
    const { now: _omit, ...verifyWithoutNow } = o.verify;
    // exp far in the future -> valid against the actual current time.
    const future = await mint({ iss: o.issuer, aud: "app-aud", email: "ada@home.test", exp: 4_102_444_800 });
    expect(await verifyAccessJwt(future, verifyWithoutNow)).toMatchObject({ email: "ada@home.test" });
    // exp in the past (NOW_SEC is 2023) -> the real clock rejects it.
    const expired = await mint({ iss: o.issuer, aud: "app-aud", email: "ada@home.test", exp: NOW_SEC });
    expect(await verifyAccessJwt(expired, verifyWithoutNow)).toBeNull();
  });
});
