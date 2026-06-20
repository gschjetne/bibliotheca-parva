import { defineConfig } from 'vitest/config';

// Minimal Vitest config used only for mutation testing (Stryker). The pure-logic
// unit tests use plain relative imports, so we skip the SvelteKit/Tailwind
// plugins for speed, and exclude the D1 integration test (db.test.ts) — it spins
// up a real local D1 via getPlatformProxy, which is too slow/stateful to re-run
// per mutant. See stryker.conf.json for the mutated file scope.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/lib/**/*.test.ts'],
		exclude: ['src/lib/server/db.test.ts'],
	},
});
