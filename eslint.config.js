import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import { fileURLToPath } from 'node:url';

// Reuse .gitignore so build output, .svelte-kit, .wrangler etc. are not linted.
const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

// This project has no svelte.config.js (SvelteKit is configured in
// vite.config.ts), so the Svelte ESLint parser is told runes mode inline —
// matching the vite compilerOptions that force runes for app code.
const svelteConfig = { compilerOptions: { runes: true } };

// Type-aware rules that catch a promise being created and then dropped — the app
// makes many fetch()/goto() calls where a missing await is a real bug.
const droppedPromiseRules = {
	'@typescript-eslint/no-floating-promises': 'error',
	// Svelte event handlers legitimately accept async functions (onclick={save}),
	// and the debounced pickers pass async callbacks to setTimeout, so don't flag
	// async callbacks in those positions — only genuinely dropped promises.
	'@typescript-eslint/no-misused-promises': [
		'error',
		{ checksVoidReturn: { arguments: false, attributes: false } },
	],
};

export default ts.config(
	includeIgnoreFile(gitignorePath),
	{ ignores: ['worker-configuration.d.ts'] },
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			// typescript-eslint resolves identifiers through the type checker.
			'no-undef': 'off',
			// Allow intentionally-unused bindings/args named with a leading underscore.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
			],
			// SvelteKit-typed-routing helper; this app has no base path or i18n, so
			// plain string hrefs/goto() are fine.
			'svelte/no-navigation-without-resolve': 'off',
		},
	},
	// providers.ts parses untyped third-party JSON (Open Library, Bibbi, Libris);
	// `any` at that ingestion boundary is deliberate.
	{
		files: ['src/lib/providers.ts'],
		rules: { '@typescript-eslint/no-explicit-any': 'off' },
	},
	// Type-aware linting needs a tsconfig that includes the file. The generated
	// SvelteKit tsconfig covers src/ (not e2e/), so scope the type-aware rules
	// there. Plain .ts modules:
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
		},
		rules: droppedPromiseRules,
	},
	// ...and Svelte components / rune modules:
	{
		files: ['src/**/*.svelte', 'src/**/*.svelte.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig,
			},
		},
		rules: {
			...droppedPromiseRules,
			// False positives on runes: $bindable()/reactive reassignments look
			// "useless" to this rule but drive Svelte's reactivity.
			'no-useless-assignment': 'off',
		},
	},
);
