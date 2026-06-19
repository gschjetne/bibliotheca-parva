import { describe, it, expect } from "vitest";
import app from "../src/index";

// Exercise the Access middleware via Hono's app.request — no server needed.
// (Routes that need D1 aren't hit here; /health is enough to test the gate.)

const env = (over: Record<string, string>) => ({ ...over }) as any;

describe("Access gate middleware", () => {
  it("refuses a request with no Access token (fail closed)", async () => {
    const res = await app.request("/health", {}, env({ ACCESS_BYPASS: "false" }));
    expect(res.status).toBe(403);
  });

  it("refuses even with a token when team domain / aud are unset", async () => {
    const res = await app.request(
      "/health",
      { headers: { "Cf-Access-Jwt-Assertion": "a.b.c" } },
      env({ ACCESS_BYPASS: "false" }),
    );
    expect(res.status).toBe(403);
  });

  it("allows requests in local bypass mode", async () => {
    const res = await app.request("/health", {}, env({ ACCESS_BYPASS: "true" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
