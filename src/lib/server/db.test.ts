import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { readFileSync, rmSync } from 'node:fs';
import { createBook } from './mutate';
import { searchBooks, suggestContributors } from './db';
import type { BookInput } from '../review';

// Integration test for the search-over-D1 path against a real (local, isolated)
// D1 via getPlatformProxy. Reusable harness for future server/endpoint tests.

let proxy: Awaited<ReturnType<typeof getPlatformProxy>>;
let db: D1Database;

const blank = (over: Partial<BookInput>): BookInput => ({
	title: null,
	subtitle: null,
	original_title: null,
	edition_name: null,
	description: null,
	isbn: null,
	published_by: null,
	published_place: null,
	published_year: null,
	languages: [],
	shelf_location: null,
	contributors: [],
	subjects: [],
	...over,
});

beforeAll(async () => {
	rmSync('.wrangler/test-db', { recursive: true, force: true });
	proxy = await getPlatformProxy<Env>({
		configPath: 'wrangler.jsonc',
		persist: { path: '.wrangler/test-db' },
	});
	db = (proxy.env as Env).DB;
	const sql = readFileSync('migrations/0001_init.sql', 'utf8').replace(/--[^\n]*/g, '');
	for (const stmt of sql
		.split(';')
		.map((s) => s.trim())
		.filter(Boolean)) {
		await db.prepare(stmt).run();
	}
});

afterAll(async () => {
	await proxy?.dispose();
});

describe('searchBooks over D1', () => {
	it('finds a book by a title word and by a contributor name', async () => {
		await createBook(
			db,
			blank({
				title: 'The Two Towers',
				contributors: [{ name: 'J. R. R. Tolkien', role: 'author' }],
			}),
		);

		const byTitle = await searchBooks(db, 'towers');
		expect(byTitle.map((b) => b.title)).toContain('The Two Towers');

		const byAuthor = await searchBooks(db, 'tolkien');
		const hit = byAuthor.find((b) => b.title === 'The Two Towers');
		expect(hit?.contributors).toBe('J. R. R. Tolkien');

		expect(await searchBooks(db, '')).toEqual([]);
	});

	it('finds a book by ISBN in either form', async () => {
		await createBook(db, blank({ title: 'The Fellowship of the Ring', isbn: '0261103571' }));
		const byIsbn13 = await searchBooks(db, '9780261103573');
		expect(byIsbn13.map((b) => b.title)).toContain('The Fellowship of the Ring');
	});
});

describe('contributor identity', () => {
	async function personIdsNamed(name: string): Promise<number[]> {
		const r = await db
			.prepare('SELECT id FROM person WHERE display_name = ? ORDER BY id')
			.bind(name)
			.all<{ id: number }>();
		return r.results.map((x) => x.id);
	}

	it('links an existing person instead of creating a duplicate', async () => {
		const NAME = 'Italo Calvino';
		await createBook(
			db,
			blank({ title: 'Invisible Cities', contributors: [{ name: NAME, role: 'author' }] }),
		);
		const [personId] = await personIdsNamed(NAME);
		expect(personId).toBeGreaterThan(0);

		// Suggestion finds the existing person…
		const suggestions = await suggestContributors(db, 'calvi');
		expect(suggestions).toContainEqual({ id: personId, name: NAME });

		// …and adding it to another book links the same identity, no duplicate.
		await createBook(
			db,
			blank({
				title: 'If on a winter’s night a traveler',
				contributors: [{ name: NAME, role: 'author', personId }],
			}),
		);
		expect(await personIdsNamed(NAME)).toEqual([personId]); // still exactly one person

		const both = await db
			.prepare('SELECT COUNT(*) AS n FROM contribution WHERE person_id = ?')
			.bind(personId)
			.first<{ n: number }>();
		expect(both?.n).toBe(2);
	});

	it('creates a new person for an unmatched name', async () => {
		await createBook(
			db,
			blank({ title: 'X', contributors: [{ name: 'A Brand New Author', role: 'author' }] }),
		);
		expect((await personIdsNamed('A Brand New Author')).length).toBe(1);
	});
});
