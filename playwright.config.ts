import { defineConfig, devices } from '@playwright/test';

// E2E against the built Worker served by `wrangler dev` (real platform: local
// D1 + .dev.vars, which sets ACCESS_BYPASS=true so the gate is open locally).
// Requires a browser + system deps — runs in CI or a container built with the
// Dockerfile's chromium libraries (run `npx playwright install chromium` first).
export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	// The whole suite shares one wrangler dev server and one local D1, and some
	// specs write to it (add/edit/delete), so tests must run serially — a single
	// worker, not just serial-within-a-file.
	fullyParallel: false,
	workers: 1,
	// One retry absorbs cold-start variance on the first test against a freshly
	// built wrangler dev server; a genuine failure still fails both attempts.
	retries: 1,
	use: { baseURL: 'http://localhost:4173' },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		// `npm run gen` (wrangler types) re-normalises worker-configuration.d.ts,
		// which `wrangler dev` rewrites on shutdown — otherwise the next run's
		// `wrangler types --check` in `build` fails as "out of date".
		command: 'npm run gen && npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: true,
		timeout: 180_000
	}
});
