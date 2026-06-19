import { defineConfig } from "vitest/config";

// Unit tests for pure modules run in the default (node) environment.
// Integration tests that need a real D1 binding will move to
// @cloudflare/vitest-pool-workers once we have DB-backed code to exercise.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
