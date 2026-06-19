import { defineConfig, devices } from '@playwright/test';

// E2E against the built Worker served by `wrangler dev` (real platform: local
// D1 + .dev.vars, which sets ACCESS_BYPASS=true so the gate is open locally).
// Requires a browser + system deps — runs in CI or a container built with the
// Dockerfile's chromium libraries (run `npx playwright install chromium` first).
export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	use: { baseURL: 'http://localhost:4173' },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: true,
		timeout: 180_000
	}
});
